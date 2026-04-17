/**
 * scripts/deploy-checklist.ts
 * Brief 28: Migrations & Deployment Guide
 *
 * Run end-to-end deployment validation:
 *   - Env vars present
 *   - Supabase reachable
 *   - Expected tables exist
 *   - Seed data populated
 *   - Stripe / Resend / Anthropic key formats valid
 *
 * Usage:
 *   tsx scripts/deploy-checklist.ts
 *   tsx scripts/deploy-checklist.ts --json   # machine-readable output
 *
 * Exit code: 0 if overall=pass|warn, 1 if overall=fail.
 */

import { runAllChecks } from "../lib/deployment";
import type { CheckResult } from "../lib/deployment";

const ICONS: Record<CheckResult["status"], string> = {
  pass: "✓",
  warn: "!",
  fail: "✗",
  skip: "-",
};

function colorize(status: CheckResult["status"], text: string): string {
  if (!process.stdout.isTTY) return text;
  const codes: Record<CheckResult["status"], string> = {
    pass: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    fail: "\x1b[31m", // red
    skip: "\x1b[90m", // gray
  };
  return `${codes[status]}${text}\x1b[0m`;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const report = await runAllChecks();

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log("Glimad deployment checklist");
    console.log("---------------------------");
    console.log(`Generated: ${report.generated_at}`);
    console.log("");

    for (const check of report.checks) {
      const icon = colorize(check.status, ICONS[check.status]);
      const duration = check.duration_ms ? ` (${check.duration_ms}ms)` : "";
      console.log(`  ${icon} ${check.name}${duration}`);
      console.log(`      ${check.message}`);
      if (check.details && Object.keys(check.details).length > 0) {
        const summary = JSON.stringify(check.details);
        if (summary.length <= 200) {
          console.log(`      ${summary}`);
        }
      }
    }

    console.log("");
    const { pass, warn, fail, skip } = report.summary;
    console.log(
      `Summary: ${pass} pass, ${warn} warn, ${fail} fail, ${skip} skip`,
    );
    console.log(
      `Overall: ${colorize(report.overall, report.overall.toUpperCase())}`,
    );
    console.log("");
  }

  process.exit(report.overall === "fail" ? 1 : 0);
}

main().catch((err) => {
  console.error("Deploy checklist crashed:", err);
  process.exit(1);
});
