/**
 * lib/deployment
 * Brief 28: Migrations & Deployment Guide
 *
 * Shared helpers for deployment validation and migration verification.
 * Used by scripts/deploy-checklist.ts and scripts/verify-migrations.ts,
 * and available to /api/health and admin routes.
 */

export * from "./checks";
export * from "./migrations";
export * from "./types";
