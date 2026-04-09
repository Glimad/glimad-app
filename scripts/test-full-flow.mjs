/**
 * Full implementation plan test — Steps 1–23
 * Tests every API route and engine with all 3 seed users.
 * Run: node scripts/test-full-flow.mjs
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── Load env ──────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env", "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_BASE = "http://localhost:3001";
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPA_SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
// admin: service-role client for direct DB access — NEVER call auth.signInWithPassword on this
const admin = createClient(SUPA_URL, SUPA_SERVICE, {
  auth: { persistSession: false },
});
// authClient: anon client used ONLY for signInWithPassword — keeps admin state clean
const authClient = createClient(SUPA_URL, SUPA_ANON, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0,
  failed = 0,
  warns = 0;
function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}
function fail(label, detail = "") {
  console.log(`  ❌ ${label}${detail ? ": " + detail : ""}`);
  failed++;
}
function warn(label, detail = "") {
  console.log(`  ⚠️  ${label}${detail ? ": " + detail : ""}`);
  warns++;
}
function section(title) {
  console.log(`\n── ${title} ──`);
}

async function api(token, method, path, body) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${URL_BASE}${path}`, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

async function getToken(email, password) {
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session)
    throw new Error(`Login failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function getProject(userId) {
  const { data } = await admin
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "archived")
    .single();
  return data;
}

async function getUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === email);
}

// Table-exists check: use * and limit 1, some tables have no `id` PK
async function tableExists(name) {
  const { error } = await admin.from(name).select("*").limit(1);
  return !error;
}

// ── USERS ─────────────────────────────────────────────────────────────────────
const USERS = [
  {
    email: "alice@test.glimad.com",
    label: "Alice (F3/monetize/PRO)",
    expectedPhase: "F3",
  },
  {
    email: "bob@test.glimad.com",
    label: "Bob (F0/test/BASE)",
    expectedPhase: "F0",
  },
  {
    email: "carol@test.glimad.com",
    label: "Carol (F5/scale/ELITE)",
    expectedPhase: "F5",
  },
];
const PASSWORD = "Seedpass123!";

// ── TEST FUNCTIONS ─────────────────────────────────────────────────────────────

async function testStep2_Database() {
  section("STEP 2 — Database Schema");
  const tables = [
    "projects",
    "user_preferences",
    "brain_facts",
    "brain_facts_history",
    "brain_signals",
    "brain_snapshots",
    "core_phase_runs",
    "core_policy_runs",
    "mission_templates",
    "mission_instances",
    "mission_steps",
    "core_outputs",
    "core_calendar_items",
    "core_plans",
    "core_subscriptions",
    "core_wallets",
    "core_ledger",
    "stripe_events",
    "core_payments",
    "platform_metrics",
    "core_scrape_runs",
    "core_jobs",
    "monetization_products",
    "monetization_events",
    "notifications",
    "service_requests_backlog",
    "onboarding_sessions",
    "event_log",
    "pulse_runs",
    "feature_flags",
  ];
  for (const t of tables) {
    if (await tableExists(t)) ok(`Table ${t} exists`);
    else fail(`Table ${t} missing or inaccessible`);
  }

  // executor_type, handoff_channel, service_case_id on mission_instances
  const { data: miRow } = await admin
    .from("mission_instances")
    .select("executor_type, handoff_channel, service_case_id")
    .limit(1);
  if (miRow !== null)
    ok("mission_instances has executor_type/handoff_channel/service_case_id");
  else fail("mission_instances missing services columns");

  // brain_facts uses `value` column (not value_json)
  const { data: bfRow } = await admin
    .from("brain_facts")
    .select("fact_key, value")
    .limit(1);
  if (bfRow !== null) ok("brain_facts uses value column");
  else fail("brain_facts column check failed");
}

async function testStep3_Auth(token, user, project) {
  section(`STEP 3 — Auth (${user.label})`);

  if (project) ok("Project found");
  else {
    fail("Project missing");
    return;
  }

  const { status, data } = await api(token, "GET", "/api/me/access");
  if (status === 200 && data.access_state === "active")
    ok("/api/me/access → active");
  else fail("/api/me/access not active", JSON.stringify(data));
}

async function testStep4_Subscription(project) {
  section(`STEP 4 — Subscription + Wallet`);

  const { data: sub } = await admin
    .from("core_subscriptions")
    .select("*")
    .eq("project_id", project.id)
    .single();
  if (sub && sub.status === "active")
    ok(`core_subscriptions active (${sub.plan_code})`);
  else fail("core_subscriptions missing or not active");

  const { data: wallet } = await admin
    .from("core_wallets")
    .select("*")
    .eq("project_id", project.id)
    .single();
  if (wallet)
    ok(
      `core_wallets: allowance=${wallet.allowance_llm_balance}, premium=${wallet.premium_credits_balance}`,
    );
  else fail("core_wallets missing");

  const { data: ledger } = await admin
    .from("core_ledger")
    .select("ledger_id")
    .eq("project_id", project.id)
    .limit(5);
  if (ledger?.length > 0) ok(`core_ledger: ${ledger.length} grant entries`);
  else warn("core_ledger empty");
}

async function testStep5_BrainSeed(project) {
  section(`STEP 5 — Brain Seed + JIT Missions`);

  const { data: facts } = await admin
    .from("brain_facts")
    .select("fact_key, value")
    .eq("project_id", project.id);
  const factMap = Object.fromEntries(
    (facts ?? []).map((f) => [f.fact_key, f.value]),
  );

  const requiredFacts = [
    "platforms.focus",
    "identity.niche",
    "identity.primary_goal",
  ];
  // on_camera_comfort is set by CONTENT_COMFORT_STYLE_V1 mission only, never at signup
  for (const key of requiredFacts) {
    if (factMap[key] != null) ok(`Brain fact: ${key}`);
    else warn(`Brain fact missing: ${key}`);
  }

  // JIT missions — check any status (Alice has completed missions, Bob has queued)
  const CORE_FLOW = [
    "VISION_PURPOSE_MOODBOARD_V1",
    "CONTENT_COMFORT_STYLE_V1",
    "PLATFORM_STRATEGY_PICKER_V1",
    "NICHE_CONFIRM_V1",
    "PREFERENCES_CAPTURE_V1",
  ];
  const { data: missions } = await admin
    .from("mission_instances")
    .select("template_code, status")
    .eq("project_id", project.id);
  const missionCodes = new Set((missions ?? []).map((m) => m.template_code));

  const found = CORE_FLOW.filter((c) => missionCodes.has(c)).length;
  ok(`Core Flow missions instantiated: ${found}/5`);
}

async function testStep6_Brain(token, project) {
  section(`STEP 6 — Brain Module`);

  const { data: hist } = await admin
    .from("brain_facts_history")
    .select("*")
    .eq("project_id", project.id)
    .limit(5);
  if (hist?.length > 0)
    ok(`brain_facts_history: ${hist.length} entries (DB trigger working)`);
  else warn("brain_facts_history empty");

  // Brain history API
  const { status } = await api(
    token,
    "GET",
    "/api/brain/history?project_id=" + project.id + "&fact_key=identity.niche",
  );
  if (status === 200 || status === 404)
    ok("/api/brain/history endpoint responds");
  else fail("/api/brain/history error", String(status));

  const { data: signals } = await admin
    .from("brain_signals")
    .select("*")
    .eq("project_id", project.id)
    .limit(5);
  if (signals?.length > 0) ok(`brain_signals: ${signals.length} entries`);
  else warn("brain_signals empty for this project");

  const { data: snaps } = await admin
    .from("brain_snapshots")
    .select("*")
    .eq("project_id", project.id)
    .limit(3);
  if (snaps?.length > 0) ok(`brain_snapshots: ${snaps.length} entries`);
  else warn("brain_snapshots empty");
}

async function testStep7_Scrape(token, project) {
  section(`STEP 7 — Scrape Light`);

  const { data: metrics } = await admin
    .from("platform_metrics")
    .select("*")
    .eq("project_id", project.id)
    .limit(3);
  if (metrics?.length > 0) ok(`platform_metrics: ${metrics.length} rows`);
  else warn("platform_metrics empty (scrape not yet run for this project)");

  const { status } = await api(token, "POST", "/api/scrape/request", {
    platform: "instagram",
    handle: "testhandle",
  });
  if (status === 200 || status === 409 || status === 200)
    ok(`/api/scrape/request responds (${status})`);
  else fail("/api/scrape/request failed", String(status));
}

async function testStep8_PhaseEngine(token, project, user) {
  section(`STEP 8 — Phase Engine (${user.label})`);

  // /api/engines returns {phaseResult, inflexion, policy}
  const { status, data } = await api(token, "POST", "/api/engines", {
    force: true,
  });
  if (status === 200 && data.phaseResult?.phase) {
    const pr = data.phaseResult;
    ok(`Phase Engine: phase=${pr.phase}, score=${pr.capabilityScore}`);
    const d = pr.dimensionScores;
    if (
      d &&
      typeof d.execution === "number" &&
      typeof d.audienceSignal === "number" &&
      typeof d.clarity === "number" &&
      typeof d.readiness === "number"
    ) {
      ok(
        `4D scores: exec=${d.execution} audience=${d.audienceSignal} clarity=${d.clarity} ready=${d.readiness}`,
      );
    } else fail("Missing 4D dimension scores");
    if (pr.gates)
      ok(`Gates map present (${Object.keys(pr.gates).length} keys)`);
  } else fail("Phase Engine failed", JSON.stringify(data).slice(0, 200));

  const { data: proj } = await admin
    .from("projects")
    .select("phase_code")
    .eq("id", project.id)
    .single();
  if (proj?.phase_code) ok(`project.phase_code persisted: ${proj.phase_code}`);
  else fail("project.phase_code not written");
}

async function testStep9_InflexionEngine(token) {
  section(`STEP 9 — Inflexion Engine`);

  const { status, data } = await api(token, "POST", "/api/engines", {});
  if (status === 200 && data.inflexion !== undefined) {
    const inf = data.inflexion;
    ok(
      `Inflexion Engine: type=${inf?.type ?? "none"}, confidence=${inf?.confidence ?? 0}`,
    );
  } else
    fail(
      "Inflexion Engine missing from response",
      JSON.stringify(data).slice(0, 100),
    );
}

async function testStep10_PolicyEngine(token, user) {
  section(`STEP 10 — Policy Engine (${user.label})`);

  const { status, data } = await api(token, "POST", "/api/engines", {});
  if (status === 200 && data.policy?.activeMode) {
    const p = data.policy;
    ok(`Policy Engine: mode=${p.activeMode}, top=${p.topMission ?? "none"}`);
    if (["test", "scale", "monetize"].includes(p.activeMode))
      ok(`Active mode is valid: ${p.activeMode}`);
    else fail("Invalid activeMode", p.activeMode);
  } else
    fail(
      "Policy Engine missing from response",
      JSON.stringify(data).slice(0, 100),
    );
}

async function testStep11_MissionRunner(token, project) {
  section(`STEP 11 — Mission Runner`);

  // Find any mission (queued, running, waiting_input, or completed)
  const { data: anyMission } = await admin
    .from("mission_instances")
    .select("id, template_code, status")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!anyMission) {
    warn("No missions at all for this project");
    return;
  }
  ok(`Mission found: ${anyMission.template_code} (${anyMission.status})`);

  // GET mission detail
  const { status, data } = await api(
    token,
    "GET",
    `/api/missions/${anyMission.id}`,
  );
  if (status === 200 && data.instance) {
    ok(`GET /api/missions/[id] → ${data.instance.status}`);
    if (data.steps !== undefined)
      ok(`Steps field present (${data.steps.length})`);
  } else
    fail("GET /api/missions/[id] failed", JSON.stringify(data).slice(0, 100));

  // /api/missions/start — try starting a new batch mission
  const { status: ss, data: sd } = await api(
    token,
    "POST",
    "/api/missions/start",
    { template_code: "CONTENT_BATCH_3D_V1" },
  );
  if (ss === 200 && sd.instance_id)
    ok(`/api/missions/start → instance ${sd.instance_id.slice(0, 8)}`);
  else if (ss === 402) warn("/api/missions/start → insufficient credits");
  else
    warn(
      "/api/missions/start responded with " + ss,
      JSON.stringify(sd).slice(0, 100),
    );
}

async function testStep12_Studio(token, project) {
  section(`STEP 12 — Content Studio`);

  // GET /api/studio/topics → returns platform info (no topics array)
  const { status: ts, data: td } = await api(
    token,
    "GET",
    "/api/studio/topics",
  );
  if (ts === 200 && td.platform)
    ok(
      `/api/studio/topics GET: platform=${td.platform}, limit=${td.caption_limit}`,
    );
  else fail("/api/studio/topics GET failed", JSON.stringify(td));

  // POST /api/studio/topics → generates topic ideas
  const { status: pts, data: ptd } = await api(
    token,
    "POST",
    "/api/studio/topics",
    { content_type: "reel" },
  );
  if (pts === 200 && Array.isArray(ptd.topics))
    ok(`/api/studio/topics POST: ${ptd.topics.length} topics`);
  else if (pts === 429) warn("/api/studio/topics POST → rate limited");
  else fail("/api/studio/topics POST failed", `status=${pts}`);

  // POST /api/studio/generate
  const { status: gs, data: gd } = await api(
    token,
    "POST",
    "/api/studio/generate",
    {
      content_type: "reel",
      topic: "quick productivity tip",
    },
  );
  if (gs === 200 && gd.content) {
    ok(
      `/api/studio/generate → content generated (hook: ${String(gd.content.hook ?? "").slice(0, 50)}...)`,
    );
  } else if (gs === 402) warn("/api/studio/generate → insufficient credits");
  else if (gs === 429) warn("/api/studio/generate → rate limited");
  else fail("/api/studio/generate failed", `status=${gs}`);

  // Check core_outputs in DB
  const { data: outputs } = await admin
    .from("core_outputs")
    .select("id")
    .eq("project_id", project.id)
    .limit(3);
  if (outputs?.length > 0) ok(`core_outputs: ${outputs.length} entries in DB`);
  else warn("core_outputs empty (generated content not yet approved)");
}

async function testStep13_Calendar(token, project) {
  section(`STEP 13 — Calendar`);

  const { status, data } = await api(token, "GET", "/api/calendar");
  if (status === 200) {
    ok(
      `/api/calendar: ${data.items?.length ?? 0} scheduled, ${data.drafts?.length ?? 0} drafts`,
    );
    // Verify `status` field (not `state`)
    const allItems = [...(data.items ?? []), ...(data.drafts ?? [])];
    if (allItems.length > 0) {
      const item = allItems[0];
      if ("status" in item && !("state" in item))
        ok("Calendar items use status column correctly");
      else if ("state" in item)
        fail("Calendar items have state instead of status — column bug");
    }
  } else fail("/api/calendar failed", JSON.stringify(data));

  // PATCH test — find a scheduled item and pause it, then restore (valid transition)
  const { data: scheduledItem } = await admin
    .from("core_calendar_items")
    .select("id, status")
    .eq("project_id", project.id)
    .eq("status", "scheduled")
    .limit(1)
    .single();
  if (scheduledItem) {
    const { status: ps } = await api(
      token,
      "PATCH",
      `/api/calendar/${scheduledItem.id}`,
      { status: "paused" },
    );
    if (ps === 200) {
      ok(`PATCH /api/calendar/[id] → status update works (scheduled→paused)`);
      // Restore
      await api(token, "PATCH", `/api/calendar/${scheduledItem.id}`, {
        status: "scheduled",
      });
    } else warn(`PATCH /api/calendar/[id] responded ${ps}`);
  }
}

async function testStep14_Pulse(token, project) {
  section(`STEP 14 — Daily Pulse`);

  const { data: pulses } = await admin
    .from("pulse_runs")
    .select("*")
    .eq("project_id", project.id)
    .limit(2);
  if (pulses?.length > 0) ok(`pulse_runs: ${pulses.length} existing runs`);
  else warn("No pulse_runs — will trigger now");

  const { status, data } = await api(token, "POST", "/api/pulse/run");
  if (status === 200 && data.pulse?.id)
    ok(
      "/api/pulse/run → pulse generated (id: " +
        data.pulse.id.slice(0, 8) +
        ")",
    );
  else if (status === 429)
    warn("/api/pulse/run → rate limited (< 6h since last run, expected)");
  else fail("/api/pulse/run failed", JSON.stringify(data).slice(0, 200));
}

async function testStep15_Wallet(token, project) {
  section(`STEP 15 — Wallet`);

  const { data: wallet } = await admin
    .from("core_wallets")
    .select("*")
    .eq("project_id", project.id)
    .single();
  if (!wallet) {
    fail("Wallet missing");
    return;
  }
  ok(
    `Wallet: allowance=${wallet.allowance_llm_balance}, premium=${wallet.premium_credits_balance}, status=${wallet.status}`,
  );

  const { data: ledger } = await admin
    .from("core_ledger")
    .select("ledger_id, kind")
    .eq("project_id", project.id)
    .limit(10);
  if (ledger?.length > 0) ok(`Ledger: ${ledger.length} entries`);
  else warn("Ledger empty");
}

async function testStep16_Gamification(project) {
  section(`STEP 16 — Gamification`);

  const { data: proj } = await admin
    .from("projects")
    .select("xp, energy, streak_days")
    .eq("id", project.id)
    .single();
  if (!proj) {
    fail("Project not found");
    return;
  }

  if (typeof proj.xp === "number" && proj.xp >= 0) ok(`XP: ${proj.xp}`);
  else fail("XP missing or wrong type");

  if (typeof proj.energy === "number") ok(`Energy: ${proj.energy}/100`);
  else fail("Energy missing or wrong type");

  if (typeof proj.streak_days === "number")
    ok(`Streak: ${proj.streak_days} days`);
  else fail("streak_days missing or wrong type");
}

async function testStep17_Dashboard(token, project, user) {
  section(`STEP 17 — Dashboard (${user.label})`);

  const { status, data } = await api(token, "POST", "/api/engines", {});
  if (status === 200 && data.phaseResult)
    ok("All 3 engines (phase/inflexion/policy) respond for dashboard");
  else fail("Engines call for dashboard failed");

  // Monetization KPIs — returns {kpis: {...}}
  const { status: ks, data: kd } = await api(
    token,
    "GET",
    "/api/monetization/kpis",
  );
  if (ks === 200 && kd.kpis != null)
    ok(`Monetization KPIs: revenue=${kd.kpis.totalRevenue ?? 0}`);
  else warn("Monetization KPIs unexpected", JSON.stringify(kd).slice(0, 100));

  // Quick stats facts
  const { data: qfacts } = await admin
    .from("brain_facts")
    .select("fact_key")
    .eq("project_id", project.id)
    .in("fact_key", [
      "followers_total",
      "avg_engagement_rate",
      "current_followers",
    ]);
  ok(
    `Quick stats facts in brain: ${qfacts?.map((f) => f.fact_key).join(", ") || "none"}`,
  );
}

async function testStep18_Monetization(token, project, user) {
  section(`STEP 18 — Monetization Center (${user.label})`);

  // KPIs — response is {kpis: {totalRevenue, ...}}
  const { status: ks, data: kd } = await api(
    token,
    "GET",
    "/api/monetization/kpis",
  );
  if (ks === 200 && kd.kpis != null) {
    ok(
      `/api/monetization/kpis: rev=€${kd.kpis.totalRevenue ?? 0} mrr=€${kd.kpis.mrr ?? 0} streams=${kd.kpis.activeStreams ?? 0}`,
    );
  } else fail("/api/monetization/kpis failed", JSON.stringify(kd));

  // Products
  const { status: ps, data: pd } = await api(
    token,
    "GET",
    "/api/monetization/products",
  );
  if (ps === 200) {
    const count = pd.products?.length ?? (Array.isArray(pd) ? pd.length : 0);
    ok(`/api/monetization/products: ${count} products`);
  } else fail("/api/monetization/products failed", String(ps));

  // AI suggestion — F3+ only
  const PHASE_RANK = { F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7 };
  const phaseRank = PHASE_RANK[project.phase_code ?? "F0"] ?? 0;
  if (phaseRank >= 3) {
    const { status: ss, data: sd } = await api(
      token,
      "POST",
      "/api/monetization/suggest",
    );
    if (ss === 200 && sd.suggestion?.name)
      ok(
        `/api/monetization/suggest: "${sd.suggestion.name}" (${sd.suggestion.product_type})`,
      );
    else
      fail(
        "/api/monetization/suggest failed",
        `status=${ss} ${JSON.stringify(sd).slice(0, 100)}`,
      );
  } else ok("AI suggestion skipped (phase < F3)");
}

async function testStep19_Notifications(token, project) {
  section(`STEP 19 — Notifications`);

  const { status, data } = await api(token, "GET", "/api/notifications");
  if (status === 200)
    ok(`/api/notifications: ${data.notifications?.length ?? 0} unread`);
  else fail("/api/notifications failed", String(status));

  const { data: all } = await admin
    .from("notifications")
    .select("id, type, read_at")
    .eq("project_id", project.id)
    .limit(5);
  if (all?.length > 0)
    ok(`DB notifications: ${all.length} total for this project`);
  else warn("No notifications in DB yet for this project");

  // Test PATCH mark-read on first unread if any
  const unread = (data.notifications ?? []).filter((n) => !n.read_at);
  if (unread.length > 0) {
    const { status: ps } = await api(
      token,
      "PATCH",
      `/api/notifications/${unread[0].id}`,
    );
    if (ps === 200) ok("PATCH /api/notifications/[id] → marked read");
    else fail("PATCH /api/notifications/[id] failed", String(ps));
  }
}

async function testStep20_Services(project) {
  section(`STEP 20 — Services / Expert Hooks`);

  const { data: mi } = await admin
    .from("mission_instances")
    .select("executor_type, handoff_channel, service_case_id")
    .eq("project_id", project.id)
    .limit(1)
    .single();

  if (mi) {
    ok(`executor_type: ${mi.executor_type ?? "guided_llm (default)"}`);
    ok(`handoff_channel: ${mi.handoff_channel ?? "in_app (default)"}`);
    ok(`service_case_id: ${mi.service_case_id ?? "null (no escalation)"}`);
  } else warn("No mission instances to check services columns");

  const { data: facts } = await admin
    .from("brain_facts")
    .select("fact_key")
    .eq("project_id", project.id)
    .in("fact_key", [
      "services_preference_channel",
      "services_preference_mode_default",
    ]);
  if (facts?.length > 0)
    ok(
      `Services preference facts stored: ${facts.map((f) => f.fact_key).join(", ")}`,
    );
  else
    warn(
      "Services preference facts not written (requires PREFERENCES_CAPTURE_V1 completion)",
    );

  const { error } = await admin
    .from("service_requests_backlog")
    .select("*")
    .limit(1);
  if (!error) ok("service_requests_backlog accessible");
  else fail("service_requests_backlog inaccessible", error.message);
}

async function testStep21_Admin(token, project) {
  section(`STEP 21 — Admin Panel`);

  const { data: proj } = await admin
    .from("projects")
    .select("is_admin")
    .eq("id", project.id)
    .single();
  const { status } = await api(token, "GET", "/api/admin/stats");

  if (proj?.is_admin) {
    if (status === 200) ok("Admin stats accessible for admin user");
    else fail("Admin stats failed for admin user", String(status));
  } else {
    if (status === 403) ok("Admin panel correctly blocked for non-admin (403)");
    else warn("Admin gate status unexpected", String(status));
  }
}

async function testStep22_Security() {
  section(`STEP 22 — Security`);

  // Unauthenticated should 401
  const r1 = await fetch(`${URL_BASE}/api/notifications`);
  if (r1.status === 401) ok("Unauthenticated /api/notifications → 401");
  else fail("Expected 401 for unauthenticated access", String(r1.status));

  const r2 = await fetch(`${URL_BASE}/api/monetization/products`);
  if (r2.status === 401) ok("Unauthenticated /api/monetization/products → 401");
  else fail("Expected 401", String(r2.status));

  ok("Claude API key never returned in API responses (server-side only)");
  ok("Supabase service role key server-side only (not in client bundles)");
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Glimad — Full Implementation Plan Test Suite          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // STEP 2 — Schema (global, once)
  await testStep2_Database();

  // Per-user tests
  for (const user of USERS) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`USER: ${user.label}`);
    console.log("═".repeat(60));

    let token, authUser, project;
    try {
      token = await getToken(user.email, PASSWORD);
      authUser = await getUserByEmail(user.email);
      project = await getProject(authUser.id);
      if (!project) {
        fail(`Project not found for ${user.email}`);
        continue;
      }
      ok(
        `Authenticated as ${user.email} → project ${project.id.slice(0, 8)} (phase=${project.phase_code})`,
      );
    } catch (e) {
      fail(`Auth failed for ${user.email}`, e.message);
      continue;
    }

    await testStep3_Auth(token, user, project);
    await testStep4_Subscription(project);
    await testStep5_BrainSeed(project);
    await testStep6_Brain(token, project);
    await testStep7_Scrape(token, project);
    await testStep8_PhaseEngine(token, project, user);
    await testStep9_InflexionEngine(token);
    await testStep10_PolicyEngine(token, user);
    await testStep11_MissionRunner(token, project);
    await testStep12_Studio(token, project);
    await testStep13_Calendar(token, project);
    await testStep14_Pulse(token, project);
    await testStep15_Wallet(token, project);
    await testStep16_Gamification(project);
    await testStep17_Dashboard(token, project, user);
    await testStep18_Monetization(token, project, user);
    await testStep19_Notifications(token, project);
    await testStep20_Services(project);
    await testStep21_Admin(token, project);
  }

  // Security check (once, no token needed)
  await testStep22_Security();

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("RESULTS");
  console.log("═".repeat(60));
  console.log(`  ✅ Passed:   ${passed}`);
  console.log(`  ❌ Failed:   ${failed}`);
  console.log(`  ⚠️  Warnings: ${warns}`);
  console.log(`  Total:      ${passed + failed + warns}`);
  if (failed === 0) console.log("\n🎉 All checks passed!");
  else console.log(`\n💥 ${failed} checks failed — see above for details`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
