/**
 * lib/deployment/migrations.ts
 * Brief 28: Migrations & Deployment Guide
 *
 * Helpers for discovering and validating SQL migration files on disk.
 * Used by scripts/verify-migrations.ts at deploy time.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { MigrationEntry } from "./types";

const MIGRATION_FILENAME_RE = /^(\d{3,4})_([a-z0-9_]+)\.sql$/i;

/**
 * Discover and sort all migration files in the given directory.
 * Sorted by numeric prefix (lexicographic, which works for zero-padded prefixes).
 */
export async function listMigrations(
  migrationsDir: string,
): Promise<MigrationEntry[]> {
  const files = await readdir(migrationsDir);
  const entries: MigrationEntry[] = [];

  for (const filename of files) {
    const match = filename.match(MIGRATION_FILENAME_RE);
    if (!match) continue;
    entries.push({
      number: match[1],
      filename,
      label: match[2].replace(/_/g, " "),
    });
  }

  // Sort by numeric prefix (ties broken by filename to handle 017/017b cases).
  entries.sort((a, b) => {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (na !== nb) return na - nb;
    return a.filename.localeCompare(b.filename);
  });

  return entries;
}

/**
 * Detect gaps in the migration sequence (e.g. 003 → 005 with 004 missing).
 * Returns a list of missing numbers. Duplicates are reported separately.
 */
export function findSequenceIssues(entries: MigrationEntry[]): {
  gaps: number[];
  duplicates: string[];
} {
  const numbers = entries.map((e) => parseInt(e.number, 10));
  const seen: Record<number, number> = {};
  for (const n of numbers) {
    seen[n] = (seen[n] ?? 0) + 1;
  }

  const gaps: number[] = [];
  const duplicates: string[] = [];
  if (numbers.length === 0) return { gaps, duplicates };

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  for (let i = min; i <= max; i++) {
    if (!(i in seen)) gaps.push(i);
  }
  for (const key of Object.keys(seen)) {
    const num = parseInt(key, 10);
    if (seen[num] > 1) {
      duplicates.push(String(num).padStart(3, "0"));
    }
  }

  return { gaps, duplicates };
}

/**
 * Heuristic lint checks for a single migration file.
 * Flags common anti-patterns (no idempotency guards on CREATE TABLE, etc.).
 */
export async function lintMigrationFile(
  migrationsDir: string,
  filename: string,
): Promise<string[]> {
  const content = await readFile(join(migrationsDir, filename), "utf8");
  const warnings: string[] = [];

  // CREATE TABLE without IF NOT EXISTS
  const createTableRe =
    /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)([a-z_][a-z0-9_.]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = createTableRe.exec(content)) !== null) {
    warnings.push(`CREATE TABLE without IF NOT EXISTS: ${m[1]}`);
  }

  // CREATE INDEX without IF NOT EXISTS
  const createIndexRe =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)([a-z_][a-z0-9_]*)/gi;
  let mi: RegExpExecArray | null;
  while ((mi = createIndexRe.exec(content)) !== null) {
    warnings.push(`CREATE INDEX without IF NOT EXISTS: ${mi[1]}`);
  }

  // CREATE TYPE without guard
  if (
    /CREATE\s+TYPE\s+[a-z_]/i.test(content) &&
    !/duplicate_object/i.test(content)
  ) {
    warnings.push(
      "CREATE TYPE without duplicate_object guard (use DO $$ ... EXCEPTION WHEN duplicate_object ...)",
    );
  }

  return warnings;
}

/**
 * Run listMigrations + findSequenceIssues + lintMigrationFile for every file
 * and return a compact summary. Safe to call at deploy time.
 */
export async function auditMigrations(migrationsDir: string): Promise<{
  count: number;
  entries: MigrationEntry[];
  gaps: number[];
  duplicates: string[];
  lint_warnings: Record<string, string[]>;
}> {
  const entries = await listMigrations(migrationsDir);
  const { gaps, duplicates } = findSequenceIssues(entries);

  const lint_warnings: Record<string, string[]> = {};
  for (const entry of entries) {
    const warnings = await lintMigrationFile(migrationsDir, entry.filename);
    if (warnings.length > 0) {
      lint_warnings[entry.filename] = warnings;
    }
  }

  return {
    count: entries.length,
    entries,
    gaps,
    duplicates,
    lint_warnings,
  };
}
