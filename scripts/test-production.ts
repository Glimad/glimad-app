// Production E2E test — hits the live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-production.ts
import { createClient } from "@supabase/supabase-js";

const BASE = "https://glimad-app-six.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

// ── Auth: create a disposable test user via Admin API ────────────────────────

const TEST_EMAIL = `e2e-test-${Date.now()}@glimad-test.dev`;
const TEST_PASSWORD = "E2eTestPass123!";
let testUserId: string | null = null;

async function getToken(): Promise<{ token: string; userId: string }> {
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Create confirmed test user
  const { data: created, error: createErr } =
    await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
  if (createErr || !created.user)
    throw new Error(`User creation failed: ${createErr?.message}`);
  testUserId = created.user.id;

  // Sign in as that user to get a real JWT
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Auth failed: ${error?.message}`);
  return { token: data.session.access_token, userId: data.user!.id };
}

async function deleteTestUser() {
  if (!testUserId) return;
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  await adminClient.auth.admin.deleteUser(testUserId);
}

// ── Ensure test project exists with a handle ──────────────────────────────────

async function ensureProject(userId: string): Promise<string> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: existing } = await admin
    .from("projects")
    .select("id, focus_platform_handle")
    .eq("user_id", userId)
    .neq("status", "archived")
    .single();

  if (existing) {
    // Ensure handle and wallet are set for the test
    if (!existing.focus_platform_handle) {
      await admin
        .from("projects")
        .update({
          focus_platform: "instagram",
          focus_platform_handle: "leomessi",
        })
        .eq("id", existing.id);
    }
    // Ensure wallet exists
    const { data: wallet } = await admin
      .from("core_wallets")
      .select("wallet_id")
      .eq("project_id", existing.id)
      .single();
    if (!wallet) {
      await admin.from("core_wallets").insert({
        project_id: existing.id,
        plan_code: "starter",
        premium_credits_balance: 100,
        allowance_llm_balance: 0,
        credits_allowance: 0,
        premium_daily_cap_remaining: 100,
        allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: "active",
      });
    }
    return existing.id;
  }

  // Create project for this user
  const { data: proj, error } = await admin
    .from("projects")
    .insert({
      user_id: userId,
      name: "Glimad Test Project",
      status: "active",
      phase_code: "F0",
      active_mode: "test",
      publishing_mode: "BUILDING",
      focus_platform: "instagram",
      focus_platform_handle: "leomessi",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Project creation failed: ${error.message}`);

  await admin.from("core_wallets").insert({
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

  return proj!.id;
}

// ── TEST 1: GET /api/scrape/run — worker auth ────────────────────────────────

async function testScrapeRunUnauthorized() {
  console.log("\n[1] GET /api/scrape/run — rejects wrong secret");
  const res = await fetch(`${BASE}/api/scrape/run`, {
    headers: { Authorization: "Bearer wrong-secret" },
  });
  ok("returns 401 for wrong secret", res.status === 401, `got ${res.status}`);
}

// ── TEST 2: GET /api/scrape/run — authorized, processes queued jobs ──────────

async function testScrapeRunAuthorized(projectId: string) {
  console.log("\n[2] GET /api/scrape/run — authorized, processes jobs");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Seed a queued job for leomessi on instagram
  const idempKey = `prod-test-scrape-${Date.now()}`;
  const { data: job } = await admin
    .from("core_jobs")
    .insert({
      project_id: projectId,
      user_id: (
        await admin
          .from("projects")
          .select("user_id")
          .eq("id", projectId)
          .single()
      ).data!.user_id,
      job_type: "scrape_light",
      status: "queued",
      idempotency_key: idempKey,
      cost_premium_credits: 5,
      max_attempts: 1,
      payload_json: { platform: "instagram", handle: "leomessi" },
    })
    .select("job_id")
    .single();

  ok("test job seeded", !!job?.job_id, "could not insert job");
  if (!job?.job_id) return;

  const res = await fetch(`${BASE}/api/scrape/run`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  ok("returns 200", res.status === 200, `got ${res.status}`);

  const body = await res.json();
  ok("processed > 0", (body.processed ?? 0) > 0, JSON.stringify(body));

  const jobResult = body.results?.find((r: any) => r.job_id === job.job_id);
  if (jobResult) {
    ok(
      "test job result is done or failed",
      ["done", "failed", "rate_limited"].some(
        (s) => jobResult.result?.includes(s) || jobResult.result === "done",
      ),
      jobResult.result,
    );
  }

  // Check job status in DB
  const { data: updatedJob } = await admin
    .from("core_jobs")
    .select("status")
    .eq("job_id", job.job_id)
    .single();
  ok(
    "job no longer queued in DB",
    updatedJob?.status !== "queued",
    `status=${updatedJob?.status}`,
  );

  return job.job_id;
}

// ── TEST 3: POST /api/engines — phase engine via production endpoint ──────────

async function testEnginesEndpoint(token: string, projectId: string) {
  console.log("\n[3] POST /api/engines — runs Phase Engine on production");

  const res = await fetch(`${BASE}/api/engines`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  ok("returns 200", res.status === 200, `got ${res.status}`);

  const body = await res.json();
  ok(
    "phaseResult present",
    !!body.phaseResult,
    JSON.stringify(body).slice(0, 200),
  );
  ok(
    "phase is valid F-code",
    /^F[0-7]$/.test(body.phaseResult?.phase ?? ""),
    `got ${body.phaseResult?.phase}`,
  );
  ok(
    "capabilityScore 0-100",
    body.phaseResult?.capabilityScore >= 0 &&
      body.phaseResult?.capabilityScore <= 100,
    `got ${body.phaseResult?.capabilityScore}`,
  );
  ok("dimensionScores present", !!body.phaseResult?.dimensionScores);
  ok(
    "8 dimension scores",
    Object.keys(body.phaseResult?.dimensionScores ?? {}).length === 8,
    `got ${Object.keys(body.phaseResult?.dimensionScores ?? {}).join(", ")}`,
  );
  ok(
    "confidence 0-1",
    body.phaseResult?.confidence >= 0 && body.phaseResult?.confidence <= 1,
    `got ${body.phaseResult?.confidence}`,
  );
  ok("reasonSummary present", !!body.phaseResult?.reasonSummary);

  console.log(
    `\n  Phase: ${body.phaseResult?.phase} | Score: ${body.phaseResult?.capabilityScore} | Confidence: ${body.phaseResult?.confidence}`,
  );
  console.log(
    `  Dimensions: ${JSON.stringify(body.phaseResult?.dimensionScores)}`,
  );
  console.log(`  Reason: ${body.phaseResult?.reasonSummary}`);

  return body.phaseResult;
}

// ── TEST 4: DB state after engines run ────────────────────────────────────────

async function testDBStateAfterEngines(projectId: string, phaseResult: any) {
  console.log("\n[4] DB state — core_phase_runs, brain_facts, projects");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // core_phase_runs
  const { data: run } = await admin
    .from("core_phase_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .single();
  ok("core_phase_runs row written", !!run);
  ok(
    "phase_code matches",
    run?.phase_code === phaseResult?.phase,
    `DB=${run?.phase_code}, result=${phaseResult?.phase}`,
  );
  ok(
    "capability_score matches",
    run?.capability_score === phaseResult?.capabilityScore,
  );
  ok("dimension_scores present", !!run?.dimension_scores);

  // brain_facts
  const { data: facts } = await admin
    .from("brain_facts")
    .select("fact_key, value")
    .eq("project_id", projectId);
  const factMap = Object.fromEntries(
    (facts ?? []).map((f) => [f.fact_key, f.value]),
  );
  ok(
    "current_phase fact written",
    factMap["current_phase"] === phaseResult?.phase,
    `got ${factMap["current_phase"]}`,
  );
  ok("phase_scores fact written", !!factMap["phase_scores"]);
  ok(
    "capability_score fact written",
    factMap["capability_score"] === phaseResult?.capabilityScore,
    `got ${factMap["capability_score"]}`,
  );

  // projects table
  const { data: project } = await admin
    .from("projects")
    .select("phase_code")
    .eq("id", projectId)
    .single();
  ok(
    "projects.phase_code updated",
    project?.phase_code === phaseResult?.phase,
    `got ${project?.phase_code}`,
  );
}

// ── TEST 5: POST /api/scrape/request — queues job via auth ───────────────────

async function testScrapeRequest(token: string, projectId: string) {
  console.log("\n[5] POST /api/scrape/request — queues job via user auth");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Clear any existing done jobs from last 24h to avoid rate_limited response
  await admin
    .from("core_jobs")
    .delete()
    .eq("project_id", projectId)
    .eq("job_type", "scrape_light")
    .eq("status", "done");

  const res = await fetch(`${BASE}/api/scrape/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  ok("returns 200", res.status === 200, `got ${res.status}`);

  const body = await res.json();
  ok("job_id returned", !!body.job_id, JSON.stringify(body));
  ok(
    "status is queued or rate_limited",
    ["queued", "rate_limited", "running", "done"].includes(body.status),
    `got ${body.status}`,
  );

  console.log(`  Scrape request: ${JSON.stringify(body)}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Production E2E Test ===");
  console.log(`Target: ${BASE}\n`);

  const { token, userId } = await getToken();
  console.log(`Authenticated as: tech@glimad.com (${userId})`);

  const projectId = await ensureProject(userId);
  console.log(`Project: ${projectId}`);

  try {
    await testScrapeRunUnauthorized();
    await testScrapeRunAuthorized(projectId);
    const phaseResult = await testEnginesEndpoint(token, projectId);
    await testDBStateAfterEngines(projectId, phaseResult);
    await testScrapeRequest(token, projectId);
  } catch (err) {
    console.error("\nFATAL:", (err as Error).message);
    failed++;
  } finally {
    console.log("\nCleaning up test user...");
    await deleteTestUser();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
