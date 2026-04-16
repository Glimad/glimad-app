// E2E test for Step 7 — Scrape Light pipeline
// Run: npx tsx --env-file=.env scripts/test-scrape.ts
import { createClient } from "@supabase/supabase-js";
import { requestScrapeLight, executeScrapeLightJob } from "../lib/scrape";
import { readFact, readSignals, writeFact } from "../lib/brain";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function cleanup(db: ReturnType<typeof admin>, projectId: string) {
  await db.from("platform_metrics").delete().eq("project_id", projectId);
  await db.from("brain_facts").delete().eq("project_id", projectId);
  await db.from("brain_signals").delete().eq("project_id", projectId);
  await db.from("brain_snapshots").delete().eq("project_id", projectId);
  await db.from("core_scrape_runs").delete().eq("project_id", projectId);
  await db.from("core_ledger").delete().eq("project_id", projectId);
  await db.from("core_jobs").delete().eq("project_id", projectId);
  await db.from("core_wallets").delete().eq("project_id", projectId);
  await db.from("projects").delete().eq("id", projectId);
}

// ── seed test project (must insert into `projects`, not `core_projects`) ──────

async function seedProject(db: ReturnType<typeof admin>) {
  // Use real existing user — projects.user_id FKs to auth.users
  const { data: existingProj } = await db
    .from("projects")
    .select("user_id")
    .limit(1)
    .single();
  if (!existingProj)
    throw new Error("No existing projects/users in DB to borrow user_id from");
  const testUserId = existingProj.user_id;

  const { data: proj, error } = await db
    .from("projects")
    .insert({
      user_id: testUserId,
      name: "Scrape E2E Test Project",
      status: "archived", // bypass unique_active_project_per_user partial index
      phase_code: "F1",
      active_mode: "test",
      publishing_mode: "BUILDING",
      focus_platform: "instagram",
      focus_platform_handle: "leomessi",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create test project: ${error.message}`);

  // Wallet — FK to core_plans (requires valid plan_code)
  const { error: walletErr } = await db.from("core_wallets").insert({
    project_id: proj!.id,
    plan_code: "starter",
    premium_credits_balance: 100,
    allowance_llm_balance: 0,
    credits_allowance: 0,
    premium_daily_cap_remaining: 100,
    allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: "active",
  });
  if (walletErr)
    throw new Error(`Failed to create wallet: ${walletErr.message}`);

  return { projectId: proj!.id, userId: testUserId };
}

// ── TEST 1: missing handle ────────────────────────────────────────────────────

async function testMissingHandle(
  db: ReturnType<typeof admin>,
  projectId: string,
) {
  console.log("\n[1] Missing handle → missing_evidence signal");

  const result = await requestScrapeLight(
    db as any,
    projectId,
    "user-1",
    "instagram",
    "",
  );
  ok("returns skipped_no_handle status", result.status === "skipped_no_handle");
  ok("returns empty job_id", result.job_id === "");

  const signals = await readSignals(
    db as any,
    projectId,
    1,
    "missing_evidence",
  );
  ok(
    "appends missing_evidence signal",
    signals.length === 1,
    `got ${signals.length}`,
  );

  const sig = signals[0]?.value as any;
  ok(
    "signal has reason=no_handle_provided",
    sig?.reason === "no_handle_provided",
    JSON.stringify(sig),
  );
  ok(
    "signal has platform=instagram",
    sig?.platform === "instagram",
    JSON.stringify(sig),
  );
}

// ── TEST 2: job creation ──────────────────────────────────────────────────────

async function testJobCreation(
  db: ReturnType<typeof admin>,
  projectId: string,
  userId: string,
) {
  console.log("\n[2] Job creation");

  const result = await requestScrapeLight(
    db as any,
    projectId,
    userId,
    "instagram",
    "leomessi",
  );
  ok("returns job_id", !!result.job_id, `job_id=${result.job_id}`);
  ok("status is queued", result.status === "queued", `status=${result.status}`);

  const { data: job, error } = await db
    .from("core_jobs")
    .select("*")
    .eq("job_id", result.job_id)
    .single();

  ok("job exists in DB", !!job, error?.message);
  ok("job_type is scrape_light", job?.job_type === "scrape_light");
  ok("status is queued", job?.status === "queued");
  ok(
    "payload platform=instagram",
    (job?.payload_json as any)?.platform === "instagram",
  );
  ok(
    "payload handle=leomessi",
    (job?.payload_json as any)?.handle === "leomessi",
  );
  ok("cost_premium_credits=5", job?.cost_premium_credits === 5);

  return result.job_id;
}

// ── TEST 3: rate limiting — already queued ─────────────────────────────────────

async function testRateLimitQueued(
  db: ReturnType<typeof admin>,
  projectId: string,
  userId: string,
  existingJobId: string,
) {
  console.log("\n[3] Rate limit — already queued job");

  const result = await requestScrapeLight(
    db as any,
    projectId,
    userId,
    "instagram",
    "leomessi",
  );
  ok(
    "returns same job_id (no duplicate)",
    result.job_id === existingJobId,
    `got ${result.job_id}`,
  );

  const { data: jobs } = await db
    .from("core_jobs")
    .select("job_id")
    .eq("project_id", projectId)
    .eq("job_type", "scrape_light");
  ok("only 1 job in DB", jobs?.length === 1, `found ${jobs?.length}`);
}

// ── TEST 4: rate limiting — done within 24h ───────────────────────────────────

async function testRateLimitDone24h(
  db: ReturnType<typeof admin>,
  projectId: string,
  userId: string,
) {
  console.log("\n[4] Rate limit — done job within 24h");

  const finishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: doneJob, error } = await db
    .from("core_jobs")
    .insert({
      project_id: projectId,
      user_id: userId,
      job_type: "scrape_light",
      status: "done",
      finished_at: finishedAt,
      idempotency_key: `rate-limit-test-${Date.now()}`,
      cost_premium_credits: 5,
      payload_json: { platform: "tiktok", handle: "testhandle" },
    })
    .select("job_id")
    .single();

  if (error) throw new Error(`Failed to seed done job: ${error.message}`);

  const result = await requestScrapeLight(
    db as any,
    projectId,
    userId,
    "tiktok",
    "testhandle",
  );
  ok(
    "returns rate_limited status",
    result.status === "rate_limited",
    `got ${result.status}`,
  );
  ok(
    "returns existing job_id",
    result.job_id === doneJob!.job_id,
    `got ${result.job_id}`,
  );

  await db.from("core_jobs").delete().eq("job_id", doneJob!.job_id);
}

// ── TEST 5: execute Instagram scrape ─────────────────────────────────────────

async function testExecuteInstagram(
  db: ReturnType<typeof admin>,
  projectId: string,
  jobId: string,
) {
  console.log("\n[5] Execute Instagram scrape job (leomessi)");

  await executeScrapeLightJob(db as any, jobId);

  // Job state
  const { data: job } = await db
    .from("core_jobs")
    .select("status, finished_at, attempts")
    .eq("job_id", jobId)
    .single();
  ok("job status=done", job?.status === "done", `status=${job?.status}`);
  ok("finished_at set", !!job?.finished_at);
  ok("attempts=1", job?.attempts === 1, `attempts=${job?.attempts}`);

  // Scrape run
  const { data: run } = await db
    .from("core_scrape_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("platform", "instagram")
    .single();
  ok("core_scrape_runs row created", !!run);
  ok("raw_json present", !!run?.raw_json);
  ok("normalized_json present", !!run?.normalized_json);
  ok("idempotency_key set", !!run?.idempotency_key);

  const norm = run?.normalized_json as any;
  ok(
    "followers_total > 0 in normalized",
    (norm?.followers_total ?? 0) > 0,
    `got ${norm?.followers_total}`,
  );
  ok("avg_er_estimated present", norm?.avg_er_estimated !== undefined);
  ok("last_post_date present", norm?.last_post_date !== undefined);

  // platform_metrics
  const { data: metrics } = await db
    .from("platform_metrics")
    .select("*")
    .eq("project_id", projectId)
    .eq("platform", "instagram")
    .single();
  ok("platform_metrics row created", !!metrics);
  ok(
    "followers_count > 0",
    (metrics?.followers_count ?? 0) > 0,
    `got ${metrics?.followers_count}`,
  );

  // brain facts
  const followers = await readFact(db as any, projectId, "followers_total");
  const er = await readFact(db as any, projectId, "avg_engagement_rate");
  const lastPost = await readFact(db as any, projectId, "last_post_date");
  const postsPerWeek = await readFact(
    db as any,
    projectId,
    "posts_per_week_average",
  );
  ok(
    "fact: followers_total > 0",
    !!followers && Number(followers) > 0,
    `got ${followers}`,
  );
  ok("fact: avg_engagement_rate written", er !== null, `got ${er}`);
  ok("fact: last_post_date written", lastPost !== null, `got ${lastPost}`);
  ok(
    "fact: posts_per_week_average written",
    postsPerWeek !== null,
    `got ${postsPerWeek}`,
  );

  // brain signals
  const completedSigs = await readSignals(
    db as any,
    projectId,
    1,
    "scrape_completed",
  );
  ok("scrape_completed signal written", completedSigs.length > 0);
  ok(
    "signal platform=instagram",
    (completedSigs[0]?.value as any)?.platform === "instagram",
  );

  const followerSigs = await readSignals(
    db as any,
    projectId,
    1,
    "growth.followers_total",
  );
  ok("growth.followers_total signal written", followerSigs.length > 0);

  const erSigs = await readSignals(
    db as any,
    projectId,
    1,
    "engagement.avg_er_7d",
  );
  ok("engagement.avg_er_7d signal written", erSigs.length > 0);

  const consistencySigs = await readSignals(
    db as any,
    projectId,
    1,
    "consistency.posts_published_7d",
  );
  ok(
    "consistency.posts_published_7d signal written",
    consistencySigs.length > 0,
  );
}

// ── TEST 6: idempotency — re-run skips the platform call ─────────────────────

async function testIdempotency(
  db: ReturnType<typeof admin>,
  projectId: string,
  userId: string,
) {
  console.log("\n[6] Idempotency — same-day re-run skips platform API call");

  const { data: runsBefore } = await db
    .from("core_scrape_runs")
    .select("run_id")
    .eq("project_id", projectId)
    .eq("platform", "instagram");

  const { data: dupeJob } = await db
    .from("core_jobs")
    .insert({
      project_id: projectId,
      user_id: userId,
      job_type: "scrape_light",
      status: "queued",
      idempotency_key: `idempotency-test-${Date.now()}`,
      cost_premium_credits: 5,
      payload_json: { platform: "instagram", handle: "leomessi" },
    })
    .select("job_id")
    .single();

  await executeScrapeLightJob(db as any, dupeJob!.job_id);

  const { data: runsAfter } = await db
    .from("core_scrape_runs")
    .select("run_id")
    .eq("project_id", projectId)
    .eq("platform", "instagram");

  ok(
    "no new scrape_run created",
    runsAfter?.length === runsBefore?.length,
    `before=${runsBefore?.length}, after=${runsAfter?.length}`,
  );

  const skippedSigs = await readSignals(
    db as any,
    projectId,
    1,
    "scrape_skipped",
  );
  ok("scrape_skipped signal written", skippedSigs.length > 0);
}

// ── TEST 7: wallet debit ──────────────────────────────────────────────────────

async function testWalletDebit(
  db: ReturnType<typeof admin>,
  projectId: string,
) {
  console.log("\n[7] Wallet debit");

  const { data: wallet } = await db
    .from("core_wallets")
    .select("premium_credits_balance")
    .eq("project_id", projectId)
    .single();

  // Started with 100. Test 5 ran one real scrape and debited 5.
  // Test 6 ran idempotency job — debit is per job_id so it also debited 5 (new job_id).
  // So balance should be 90 (100 - 5 - 5).
  ok(
    "wallet balance was debited",
    (wallet?.premium_credits_balance ?? 100) < 100,
    `balance=${wallet?.premium_credits_balance}`,
  );

  // Verify ledger entries exist
  const { data: ledger } = await db
    .from("core_ledger")
    .select("ledger_id, amount_premium")
    .eq("project_id", projectId);
  ok(
    "ledger entries created",
    (ledger?.length ?? 0) > 0,
    `found ${ledger?.length}`,
  );
  ok(
    "all ledger entries are debits",
    ledger?.every((l) => (l.amount_premium ?? 0) < 0) ?? false,
  );
}

// ── TEST 8: data_correction signal ───────────────────────────────────────────

async function testDataCorrection(
  db: ReturnType<typeof admin>,
  projectId: string,
  userId: string,
) {
  console.log(
    "\n[8] data_correction signal — self-reported vs actual ≥30% diff",
  );

  // Write a self-reported follower count vastly different from leomessi's actual (~500M)
  await writeFact(
    db as any,
    projectId,
    "approximate_followers_self_reported",
    1000,
    "test",
  );

  // Clear today's idempotency record so the scrape actually runs (not skipped)
  const today = new Date().toISOString().slice(0, 10);
  await db
    .from("core_scrape_runs")
    .delete()
    .eq("idempotency_key", `instagram:leomessi:${today}`);

  // Execute a fresh scrape job for leomessi
  const { data: job } = await db
    .from("core_jobs")
    .insert({
      project_id: projectId,
      user_id: userId,
      job_type: "scrape_light",
      status: "queued",
      idempotency_key: `data-correction-test-${Date.now()}`,
      cost_premium_credits: 5,
      payload_json: { platform: "instagram", handle: "leomessi" },
    })
    .select("job_id")
    .single();

  await executeScrapeLightJob(db as any, job!.job_id);

  const correctionSigs = await readSignals(
    db as any,
    projectId,
    1,
    "data_correction",
  );
  ok(
    "data_correction signal written",
    correctionSigs.length > 0,
    `got ${correctionSigs.length}`,
  );

  const sig = correctionSigs[0]?.value as any;
  ok(
    "data_correction has self_reported",
    sig?.self_reported === 1000,
    JSON.stringify(sig),
  );
  ok(
    "data_correction has actual followers",
    (sig?.actual ?? 0) > 1000,
    JSON.stringify(sig),
  );
  ok(
    "data_correction pct_diff > 30",
    (sig?.pct_diff ?? 0) > 30,
    `got ${sig?.pct_diff}`,
  );
  ok(
    "data_correction has fact=followers",
    sig?.fact === "followers",
    JSON.stringify(sig),
  );

  // Clean up the self-reported fact so it doesn't affect other tests
  await db
    .from("brain_facts")
    .delete()
    .eq("project_id", projectId)
    .eq("fact_key", "approximate_followers_self_reported");
}

// ── TEST 9: Phase Engine triggered after execute ──────────────────────────────

async function testPhaseEngineTriggered(
  db: ReturnType<typeof admin>,
  projectId: string,
) {
  console.log(
    "\n[9] Phase Engine triggered — core_phase_runs written after execute",
  );

  const { data: runs } = await db
    .from("core_phase_runs")
    .select("run_id, phase_code, capability_score, computed_at")
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1);

  ok(
    "core_phase_runs row exists after execute",
    (runs?.length ?? 0) > 0,
    "no phase run found",
  );

  const run = runs?.[0];
  ok(
    "phase_code is valid F-code",
    /^F[0-7]$/.test(run?.phase_code ?? ""),
    `got ${run?.phase_code}`,
  );
  ok(
    "capability_score 0-100",
    (run?.capability_score ?? -1) >= 0 && (run?.capability_score ?? 101) <= 100,
    `got ${run?.capability_score}`,
  );

  // current_phase fact must match last run
  const currentPhase = await readFact(db as any, projectId, "current_phase");
  ok(
    "current_phase fact matches last run",
    currentPhase === run?.phase_code,
    `fact=${currentPhase}, run=${run?.phase_code}`,
  );
}

// ── TEST 10: retry signals on failure ─────────────────────────────────────────

async function testRetrySignals(
  db: ReturnType<typeof admin>,
  projectId: string,
  userId: string,
) {
  console.log("\n[10] Retry — scrape_failed signals on bad handle");

  // Queue a job with a non-existent handle that will cause an API error
  const { data: badJob } = await db
    .from("core_jobs")
    .insert({
      project_id: projectId,
      user_id: userId,
      job_type: "scrape_light",
      status: "queued",
      idempotency_key: `retry-test-${Date.now()}`,
      cost_premium_credits: 5,
      payload_json: {
        platform: "instagram",
        handle: "xyzzy_this_handle_does_not_exist_9999z",
      },
    })
    .select("job_id")
    .single();

  // This should fail (likely 404 or empty response from Instagram)
  // The retry will fire up to 3 times (adding ~7 seconds total with backoff)
  console.log("  (waiting for retries with backoff — up to ~7 seconds...)");

  const failedWithError = await executeScrapeLightJob(db as any, badJob!.job_id)
    .then(() => false)
    .catch(() => true);

  // If the handle happened to resolve (Instagram returns something), skip retry test
  if (!failedWithError) {
    console.log(
      "  ~ handle resolved — Instagram returned data, retry test skipped",
    );
    await db.from("core_jobs").delete().eq("job_id", badJob!.job_id);
    return;
  }

  const failedSigs = await readSignals(
    db as any,
    projectId,
    1,
    "scrape_failed",
  );
  ok(
    "scrape_failed signal(s) written",
    failedSigs.length > 0,
    `got ${failedSigs.length}`,
  );
  ok(
    "signal has attempt number",
    (failedSigs[0]?.value as any)?.attempt !== undefined,
  );
  ok("signal has reason", !!(failedSigs[0]?.value as any)?.reason);

  const notifSigs = await readSignals(
    db as any,
    projectId,
    1,
    "user_notification",
  );
  ok(
    "user_notification signal written after 3 failures",
    notifSigs.length > 0,
    `got ${notifSigs.length}`,
  );
  ok(
    "notification type=scrape_failed_final",
    (notifSigs[0]?.value as any)?.type === "scrape_failed_final",
  );

  await db.from("core_jobs").delete().eq("job_id", badJob!.job_id);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Scrape Light E2E Test ===\n");

  const db = admin();
  const { projectId, userId } = await seedProject(db);
  console.log(`Test project: ${projectId}`);

  // Check network once — Instagram-dependent tests are skipped if unreachable
  const hasNetwork = await fetch("https://www.instagram.com/", {
    signal: AbortSignal.timeout(5000),
  })
    .then(() => true)
    .catch(() => false);
  if (!hasNetwork) {
    console.log(
      "NOTE: instagram.com unreachable — tests 5–8 will be skipped (network firewall on this machine)\n",
    );
  }

  let instagramJobId = "";

  try {
    await testMissingHandle(db, projectId);
    instagramJobId = await testJobCreation(db, projectId, userId);
    await testRateLimitQueued(db, projectId, userId, instagramJobId);
    await testRateLimitDone24h(db, projectId, userId);
    if (hasNetwork) {
      await testExecuteInstagram(db, projectId, instagramJobId);
      await testIdempotency(db, projectId, userId);
      await testWalletDebit(db, projectId);
      await testDataCorrection(db, projectId, userId);
      await testPhaseEngineTriggered(db, projectId);
      await testRetrySignals(db, projectId, userId);
    }
  } catch (err) {
    console.error("\nFATAL ERROR:", (err as Error).message);
    failed++;
  } finally {
    console.log("\nCleaning up test data...");
    await cleanup(db, projectId);
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
