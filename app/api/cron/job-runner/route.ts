/**
 * app/api/cron/job-runner/route.ts
 * Brief 16: Job Runner — processes queued core_lab_jobs
 *
 * Runs every 2 minutes via cron (Vercel cron / GitHub Action).
 * Processes up to 5 jobs per invocation with exponential backoff retry.
 *
 * Auth: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getQueuedJobs,
  executeJob,
  logEvent,
  generateCorrelationId,
  applyBrainPatch,
  saveOutput,
  type JobExecutor,
} from "@/lib/operations";
import { readAllFacts, readSignals } from "@/lib/brain";
import { appendSignal } from "@/lib/brain";

// ============================================================================
// JOB EXECUTORS
// Registered executors keyed by action_key.
// Each executor receives (admin, job, correlationId) and returns a response JSON.
// ============================================================================

const executors: Record<string, JobExecutor> = {
  // ---- Daily pulse analysis ----
  daily_pulse: async (admin, job, correlationId) => {
    const { project_id } = job;
    const facts = await readAllFacts(admin, project_id);
    const signals = await readSignals(admin, project_id, 48);

    const recentSignals = Array.isArray(signals) ? signals.slice(0, 20) : [];
    const followerCount = facts["followers"] as number | undefined;
    const engagement = facts["engagement_rate"] as number | undefined;

    // Write pulse signal
    await appendSignal(
      admin,
      project_id,
      "daily_pulse_run",
      {
        correlation_id: correlationId,
        signals_count: recentSignals.length,
      },
      "cron",
    );

    // Save pulse output
    const outputId = await saveOutput(
      admin,
      project_id,
      "analysis",
      {
        hypothesis: "daily_performance_snapshot",
        correlation_id: correlationId,
        metrics_snapshot: {
          followers: followerCount ?? null,
          engagement_rate: engagement ?? null,
          recent_signals_count: recentSignals.length,
        },
        top_actions: buildDailyActions(facts),
      },
      { job_id: job.job_id, title: "Daily Pulse" },
    );

    await applyBrainPatch(
      admin,
      project_id,
      {
        signals_append: [
          {
            key: "daily_pulse_run",
            value: { run_at: new Date().toISOString(), output_id: outputId },
            source: "cron",
          },
        ],
      },
      `daily_pulse:${project_id}:${new Date().toISOString().slice(0, 10)}`,
      job.mission_instance_id ?? undefined,
      job.job_id,
    );

    return { output_id: outputId, status: "ok" };
  },

  // ---- Scrape refresh trigger ----
  scrape_refresh: async (admin, job, correlationId) => {
    const { project_id, request_json } = job;
    const platform = (request_json["platform"] as string) ?? "instagram";

    await appendSignal(
      admin,
      project_id,
      "scrape_requested",
      {
        platform,
        correlation_id: correlationId,
      },
      "cron",
    );

    return { platform, status: "scrape_queued", correlation_id: correlationId };
  },

  // ---- Brain patch application ----
  apply_brain_patch: async (admin, job) => {
    const { project_id, request_json } = job;
    const patch = request_json["patch"] as Record<string, unknown> | undefined;

    if (!patch) return { applied: false, error: "No patch provided" };

    await applyBrainPatch(
      admin,
      project_id,
      patch as import("@/lib/operations").BrainPatchJson,
      job.idempotency_key,
      job.mission_instance_id ?? undefined,
      job.job_id,
    );

    return { applied: true };
  },
};

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const correlationId = generateCorrelationId();
  const admin = createAdminClient();
  const jobs = await getQueuedJobs(admin, 5);

  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0, correlation_id: correlationId });
  }

  await logEvent(admin, "job_runner_started", "cron", correlationId, {
    jobs_found: jobs.length,
  });

  const results: Array<{ job_id: string; success: boolean }> = [];

  for (const job of jobs) {
    const result = await executeJob(admin, job.job_id, executors);
    results.push({ job_id: job.job_id, success: result.success });
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  await logEvent(admin, "job_runner_completed", "cron", correlationId, {
    processed: results.length,
    succeeded,
    failed,
  });

  return NextResponse.json({
    processed: results.length,
    succeeded,
    failed,
    correlation_id: correlationId,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function buildDailyActions(
  facts: Record<string, unknown>,
): Array<{ action: string; why: string }> {
  const actions: Array<{ action: string; why: string }> = [];

  if (!facts["positioning"]) {
    actions.push({
      action: "Define your niche",
      why: "No positioning set yet",
    });
  }

  if (!facts["content_pillars"]) {
    actions.push({ action: "Set content pillars", why: "No pillars defined" });
  }

  if (actions.length === 0) {
    actions.push({
      action: "Review your dashboard",
      why: "Stay on track with your goals",
    });
  }

  return actions.slice(0, 3);
}
