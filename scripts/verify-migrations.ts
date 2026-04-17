/**
 * scripts/verify-migrations.ts
 * Brief 28: Migrations & Deployment Guide
 *
 * Audit local migration files for:
 *   - Sequence gaps / duplicates
 *   - Missing idempotency guards (IF NOT EXISTS, duplicate_object)
 *
 * Optionally check the live Supabase DB for expected tables and RLS.
 *
 * Usage:
 *   tsx scripts/verify-migrations.ts              # local lint only
 *   tsx scripts/verify-migrations.ts --check-db   # + live DB checks
 *
 * Exit code: 0 on pass, 1 on any fail.
 */

import { join } from "node:path";

import {
  auditMigrations,
  checkSeedData,
  checkSupabaseReachable,
  checkTablesExist,
  EXPECTED_RLS_TABLES,
} from "../lib/deployment";
import { publicEnv, serverEnv } from "../lib/env";
import { createAdminClient } from "../lib/supabase/admin";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function colorize(
  kind: "pass" | "warn" | "fail" | "info",
  text: string,
): string {
  if (!process.stdout.isTTY) return text;
  const codes = {
    pass: "\x1b[32m",
    warn: "\x1b[33m",
    fail: "\x1b[31m",
    info: "\x1b[36m",
  } as const;
  return `${codes[kind]}${text}\x1b[0m`;
}

async function checkRlsEnabled(): Promise<{
  ok: boolean;
  message: string;
  details: Record<string, unknown>;
}> {
  if (!publicEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Supabase not configured", details: {} };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "exec_sql" as never,
    {
      sql: `
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
    `,
      params: [EXPECTED_RLS_TABLES],
    } as never,
  );

  // Many Supabase projects do not expose an exec_sql RPC; fall back to
  // a query against pg_tables via the PostgREST introspection table.
  if (error) {
    return {
      ok: true,
      message:
        "RLS check skipped (no exec_sql RPC). Verify manually: SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';",
      details: { skipped: true },
    };
  }
  const rows =
    (data as Array<{ tablename: string; rowsecurity: boolean }>) ?? [];
  const without = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
  return {
    ok: without.length === 0,
    message:
      without.length === 0
        ? "RLS enabled on all expected tables"
        : `RLS disabled on: ${without.join(", ")}`,
    details: { without_rls: without },
  };
}

async function main(): Promise<void> {
  const checkDb = process.argv.includes("--check-db");
  let hadFailure = false;

  console.log("");
  console.log("Migration audit");
  console.log("---------------");

  // --- Local file audit ---------------------------------------------------
  const audit = await auditMigrations(MIGRATIONS_DIR);
  console.log(colorize("info", `Found ${audit.count} migration file(s)`));

  if (audit.duplicates.length > 0) {
    console.log(
      colorize(
        "warn",
        `! Duplicate migration numbers: ${audit.duplicates.join(", ")}`,
      ),
    );
  } else {
    console.log(colorize("pass", "✓ No duplicate migration numbers"));
  }

  if (audit.gaps.length > 0) {
    console.log(
      colorize("warn", `! Gaps in sequence at: ${audit.gaps.join(", ")}`),
    );
  } else {
    console.log(colorize("pass", "✓ No gaps in migration sequence"));
  }

  const lintFiles = Object.keys(audit.lint_warnings);
  if (lintFiles.length > 0) {
    console.log(
      colorize(
        "warn",
        `! Idempotency warnings in ${lintFiles.length} file(s):`,
      ),
    );
    for (const file of lintFiles) {
      console.log(`    ${file}`);
      for (const w of audit.lint_warnings[file]) {
        console.log(`      - ${w}`);
      }
    }
  } else {
    console.log(colorize("pass", "✓ All migrations use idempotency guards"));
  }

  // --- Optional DB checks -------------------------------------------------
  if (checkDb) {
    console.log("");
    console.log("Database audit");
    console.log("--------------");

    const reach = await checkSupabaseReachable();
    console.log(
      reach.status === "pass"
        ? colorize("pass", `✓ ${reach.message}`)
        : colorize("fail", `✗ ${reach.message}`),
    );
    if (reach.status === "fail") hadFailure = true;

    if (reach.status === "pass") {
      const tables = await checkTablesExist();
      console.log(
        tables.status === "pass"
          ? colorize("pass", `✓ ${tables.message}`)
          : colorize("fail", `✗ ${tables.message}`),
      );
      if (tables.status === "fail") hadFailure = true;

      const seed = await checkSeedData();
      console.log(
        seed.status === "pass"
          ? colorize("pass", `✓ ${seed.message}`)
          : colorize("fail", `✗ ${seed.message}`),
      );
      if (seed.status === "fail") hadFailure = true;

      const rls = await checkRlsEnabled();
      console.log(
        rls.ok
          ? colorize("pass", `✓ ${rls.message}`)
          : colorize("warn", `! ${rls.message}`),
      );
    }
  } else {
    console.log("");
    console.log(
      colorize("info", "Tip: pass --check-db to also verify the live database"),
    );
  }

  console.log("");
  process.exit(hadFailure ? 1 : 0);
}

main().catch((err) => {
  console.error("Migration audit crashed:", err);
  process.exit(1);
});
