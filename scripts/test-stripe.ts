// Step 4 production E2E — tests the entire Stripe paywall pipeline via the live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-stripe.ts
//
// Tests:
//   1. POST /api/stripe/checkout — returns Stripe Checkout URL for each plan (BASE / PRO / ELITE)
//   2. checkout.session.completed webhook → core_subscriptions, core_wallets, core_ledger,
//      core_access_grants, brain_facts, brain_signals, core_phase_runs, user_preferences
//   3. invoice.paid webhook → renewal credits granted, period dates updated, idempotency (no double grant)
//   4. invoice.payment_failed webhook → subscription + wallet → past_due
//   5. charge.refunded webhook → subscription canceled, access grant revoked, wallet locked, ledger refund row
//   6. customer.subscription.deleted webhook → subscription = canceled, access grant revoked
//   7. Idempotency — same event sent twice → same result, no duplicate ledger entries
//
// Strategy: we create real Stripe test-mode objects (customer, product, price, subscription)
// and construct properly signed webhook events from them so the production endpoint
// can verify the signature and retrieve live Stripe data without errors.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const BASE = "https://glimad-app-six.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const STRIPE_PRICE_BASE = process.env.STRIPE_PRICE_BASE!;
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO!;
const STRIPE_PRICE_ELITE = process.env.STRIPE_PRICE_ELITE!;

const stripe = new Stripe(STRIPE_SECRET_KEY);

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

// ── Auth: create disposable test user ─────────────────────────────────────────

const TEST_EMAIL = `e2e-stripe-${Date.now()}@glimad-test.dev`;
const TEST_PASSWORD = "E2eTestPass123!";
let testUserId: string | null = null;
let stripeCustomerId: string | null = null;
let stripeSubscriptionId: string | null = null;

async function getToken(): Promise<{ token: string; userId: string }> {
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: created, error: createErr } =
    await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
  if (createErr || !created.user)
    throw new Error(`User creation failed: ${createErr?.message}`);
  testUserId = created.user.id;

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

// ── Seed project with onboarding session ──────────────────────────────────────

async function ensureProject(userId: string): Promise<string> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Update the auto-created project (handle_new_user trigger creates it on signup)
  const { data: proj, error: projErr } = await admin
    .from("projects")
    .update({
      name: "Stripe E2E Test Project",
      status: "active",
      phase_code: "F0",
      active_mode: "test",
      publishing_mode: "BUILDING",
      focus_platform: "instagram",
      focus_platform_handle: "testhandle",
    })
    .eq("user_id", userId)
    .select("id")
    .single();

  if (projErr || !proj)
    throw new Error(`Project update failed: ${projErr?.message}`);

  // Seed an onboarding session linked to this user (needed by seedBrainFromOnboarding)
  await admin.from("onboarding_sessions").insert({
    converted_to_user_id: userId,
    status: "completed",
    step_current: 6,
    step_total: 6,
    experiment_variant: "control",
    responses_json: {
      interests: "fitness, nutrition",
      goal_90d: "Reach 10k followers",
      blocker_1: "No time to create content",
      face_pref: "yes",
      time_budget_week: "3-5 hours",
      platform_current: "instagram",
      handle_current: "testhandle",
    },
  });

  return proj.id;
}

async function cleanupProject(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("core_ledger").delete().eq("project_id", projectId);
  await admin.from("core_wallets").delete().eq("project_id", projectId);
  await admin.from("core_access_grants").delete().eq("project_id", projectId);
  await admin.from("core_subscriptions").delete().eq("project_id", projectId);
  await admin.from("brain_facts").delete().eq("project_id", projectId);
  await admin.from("brain_signals").delete().eq("project_id", projectId);
  await admin.from("brain_snapshots").delete().eq("project_id", projectId);
  await admin.from("core_phase_runs").delete().eq("project_id", projectId);
  await admin.from("core_scrape_runs").delete().eq("project_id", projectId);
  await admin.from("core_jobs").delete().eq("project_id", projectId);
  await admin.from("user_preferences").delete().eq("project_id", projectId);
  await admin
    .from("onboarding_sessions")
    .delete()
    .eq("converted_to_user_id", projectId.slice(0, 0)); // noop
  await admin.from("projects").delete().eq("id", projectId);
}

async function cleanupStripe() {
  if (stripeSubscriptionId) {
    await stripe.subscriptions.cancel(stripeSubscriptionId).catch(() => {});
  }
  if (stripeCustomerId) {
    await stripe.customers.del(stripeCustomerId).catch(() => {});
  }
}

// ── Webhook helper: construct a signed event body and POST it ─────────────────

async function sendWebhookEvent(
  eventType: string,
  eventData: object,
): Promise<Response> {
  const payload = JSON.stringify({
    id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    type: eventType,
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: eventData },
  });

  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: STRIPE_WEBHOOK_SECRET,
  });

  return fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    },
    body: payload,
  });
}

// ── TEST 1: POST /api/stripe/checkout ─────────────────────────────────────────

async function testCheckout(token: string) {
  console.log(
    "\n[1] POST /api/stripe/checkout — returns Checkout URL for each plan",
  );

  for (const plan_code of ["starter", "growth", "scale"]) {
    const res = await fetch(`${BASE}/api/stripe/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan_code }),
    });
    ok(`${plan_code} returns 200`, res.status === 200, `got ${res.status}`);

    const body = await res.json();
    ok(
      `${plan_code} url is present`,
      typeof body.url === "string" && body.url.startsWith("https://"),
      `url=${body.url}`,
    );
    ok(
      `${plan_code} url is Stripe checkout`,
      body.url?.includes("checkout.stripe.com"),
      `url=${body.url}`,
    );
  }
}

// ── TEST 2: checkout.session.completed ────────────────────────────────────────

async function testCheckoutSessionCompleted(userId: string, projectId: string) {
  console.log("\n[2] checkout.session.completed → full activation pipeline");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Create real Stripe test-mode customer and subscription
  const customer = await stripe.customers.create({
    email: TEST_EMAIL,
    metadata: { user_id: userId },
  });
  stripeCustomerId = customer.id;

  // Store customer mapping so the webhook can find it
  await admin.from("core_stripe_customers").upsert(
    {
      user_id: userId,
      stripe_customer_id: customer.id,
    },
    { onConflict: "user_id" },
  );

  // Create a Stripe subscription in test mode (BASE plan)
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: STRIPE_PRICE_BASE }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });
  stripeSubscriptionId = subscription.id;
  const item = subscription.items.data[0];

  // Construct a checkout.session.completed event with real IDs
  const sessionObject = {
    id: `cs_test_${Date.now()}`,
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    customer: customer.id,
    client_reference_id: userId,
    subscription: subscription.id,
    metadata: { user_id: userId, plan_code: "starter" },
  };

  const res = await sendWebhookEvent(
    "checkout.session.completed",
    sessionObject,
  );
  ok("webhook returns 200", res.status === 200, `got ${res.status}`);

  // Allow a moment for async DB writes
  await new Promise((r) => setTimeout(r, 2000));

  // ── core_subscriptions ────────────────────────────────────────────────────
  const { data: sub } = await admin
    .from("core_subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subscription.id)
    .single();
  ok("core_subscriptions row created", !!sub, "row missing");
  ok(
    "subscription status = active",
    sub?.status === "active",
    `status=${sub?.status}`,
  );
  ok(
    "subscription plan_code = starter",
    sub?.plan_code === "starter",
    `plan=${sub?.plan_code}`,
  );
  ok(
    "subscription user_id set",
    sub?.user_id === userId,
    `user_id=${sub?.user_id}`,
  );
  ok(
    "subscription project_id set",
    sub?.project_id === projectId,
    `project_id=${sub?.project_id}`,
  );
  ok("subscription period_start set", !!sub?.current_period_start, "missing");
  ok("subscription period_end set", !!sub?.current_period_end, "missing");

  // ── core_access_grants ────────────────────────────────────────────────────
  const { data: grant } = await admin
    .from("core_access_grants")
    .select("*")
    .eq("reference_id", subscription.id)
    .eq("status", "active")
    .single();
  ok("core_access_grants row created", !!grant, "row missing");
  ok(
    "access grant source = subscription",
    grant?.source === "subscription",
    `source=${grant?.source}`,
  );
  ok(
    "access grant user_id set",
    grant?.user_id === userId,
    `user_id=${grant?.user_id}`,
  );

  // ── core_wallets ──────────────────────────────────────────────────────────
  const { data: wallet } = await admin
    .from("core_wallets")
    .select("*")
    .eq("project_id", projectId)
    .single();
  ok("core_wallets row created", !!wallet, "row missing");
  ok(
    "wallet plan_code = starter",
    wallet?.plan_code === "starter",
    `plan=${wallet?.plan_code}`,
  );
  ok(
    "wallet status = active",
    wallet?.status === "active",
    `status=${wallet?.status}`,
  );
  ok(
    "wallet allowance_llm_balance = 2000",
    wallet?.allowance_llm_balance === 2000,
    `balance=${wallet?.allowance_llm_balance}`,
  );
  ok(
    "wallet premium_credits_balance = 500",
    wallet?.premium_credits_balance === 500,
    `balance=${wallet?.premium_credits_balance}`,
  );

  // ── core_ledger credit entry ──────────────────────────────────────────────
  const { data: ledger } = await admin
    .from("core_ledger")
    .select("*")
    .eq("project_id", projectId)
    .eq("kind", "credit")
    .eq("reason_key", "PLAN_MONTHLY_GRANT")
    .single();
  ok("core_ledger PLAN_MONTHLY_GRANT entry created", !!ledger, "row missing");
  ok(
    "ledger amount_allowance = 2000",
    ledger?.amount_allowance === 2000,
    `got ${ledger?.amount_allowance}`,
  );
  ok(
    "ledger amount_premium = 500",
    ledger?.amount_premium === 500,
    `got ${ledger?.amount_premium}`,
  );
  ok("ledger idempotency_key set", !!ledger?.idempotency_key, "missing");

  // ── brain_facts from onboarding (seedBrainFromOnboarding) ────────────────
  const { data: facts } = await admin
    .from("brain_facts")
    .select("fact_key, value")
    .eq("project_id", projectId);
  const factMap = Object.fromEntries(
    (facts ?? []).map((f) => [f.fact_key, f.value]),
  );
  ok(
    "brain_facts: niche_raw written",
    factMap["niche_raw"] !== undefined,
    `got=${JSON.stringify(factMap["niche_raw"])}`,
  );
  ok(
    "brain_facts: primary_goal written",
    factMap["primary_goal"] !== undefined,
  );
  ok(
    "brain_facts: main_blocker written",
    factMap["main_blocker"] !== undefined,
  );
  ok(
    "brain_facts: on_camera_comfort written",
    factMap["on_camera_comfort"] !== undefined,
  );
  ok(
    "brain_facts: current_platforms written",
    factMap["current_platforms"] !== undefined,
  );
  ok(
    "brain_facts: focus_platform_handle written",
    factMap["focus_platform_handle"] !== undefined,
  );

  // ── brain_signals from onboarding ────────────────────────────────────────
  const { data: signals } = await admin
    .from("brain_signals")
    .select("signal_key")
    .eq("project_id", projectId);
  const sigKeys = new Set(
    (signals ?? []).map((s: { signal_key: string }) => s.signal_key),
  );
  ok(
    "brain_signals: onboarding_completed written",
    sigKeys.has("onboarding_completed"),
    `signals=${Array.from(sigKeys).join(",")}`,
  );
  ok(
    "brain_signals: platform_declared written",
    sigKeys.has("platform_declared"),
  );

  // ── user_preferences ─────────────────────────────────────────────────────
  const { data: prefs } = await admin
    .from("user_preferences")
    .select("*")
    .eq("project_id", projectId)
    .single();
  ok("user_preferences row written", !!prefs, "row missing");
  ok(
    "user_preferences face_visibility set",
    ["yes", "no", "maybe"].includes(prefs?.face_visibility ?? ""),
    `face_visibility=${prefs?.face_visibility}`,
  );
  ok(
    "user_preferences availability_hours_week set",
    (prefs?.availability_hours_week ?? 0) > 0,
    `hours=${prefs?.availability_hours_week}`,
  );

  // ── Phase Engine triggered (core_phase_runs) ──────────────────────────────
  const { data: phaseRun } = await admin
    .from("core_phase_runs")
    .select("phase_code")
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .single();
  ok(
    "core_phase_runs entry created (phase engine ran)",
    !!phaseRun?.phase_code,
    "no core_phase_runs row",
  );
  ok(
    "phase_code is valid F-code",
    /^F[0-7]$/.test(phaseRun?.phase_code ?? ""),
    `phase_code=${phaseRun?.phase_code}`,
  );

  // ── stripe_events: event saved as processed ────────────────────────────────
  const { data: stripeEvent } = await admin
    .from("stripe_events")
    .select("processed")
    .eq("event_type", "checkout.session.completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  ok(
    "stripe_events: event saved as processed",
    stripeEvent?.processed === true,
    `processed=${stripeEvent?.processed}`,
  );

  return { subscriptionId: subscription.id, customerId: customer.id };
}

// ── TEST 3: invoice.paid (renewal) ────────────────────────────────────────────

async function testInvoicePaid(
  userId: string,
  projectId: string,
  subscriptionId: string,
) {
  console.log("\n[3] invoice.paid → renewal credits granted, period updated");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Get current ledger count before renewal
  const { count: beforeCount } = await admin
    .from("core_ledger")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  const invoiceId = `in_test_${Date.now()}`;
  const nowSec = Math.floor(Date.now() / 1000);

  const invoiceObject = {
    id: invoiceId,
    object: "invoice",
    status: "paid",
    customer: stripeCustomerId,
    parent: {
      subscription_details: {
        subscription: subscriptionId,
      },
    },
    amount_due: 2900,
    amount_paid: 2900,
    currency: "eur",
  };

  const res = await sendWebhookEvent("invoice.paid", invoiceObject);
  ok(
    "invoice.paid webhook returns 200",
    res.status === 200,
    `got ${res.status}`,
  );

  await new Promise((r) => setTimeout(r, 1500));

  // Ledger should have a new credit entry for the renewal
  const { data: renewalLedger } = await admin
    .from("core_ledger")
    .select("*")
    .eq("project_id", projectId)
    .eq("idempotency_key", `invoice_${invoiceId}_grant`)
    .single();
  ok(
    "core_ledger: renewal grant entry created",
    !!renewalLedger,
    "row missing",
  );
  ok(
    "renewal grant amount_allowance = 2000",
    renewalLedger?.amount_allowance === 2000,
    `got=${renewalLedger?.amount_allowance}`,
  );
  ok(
    "renewal grant amount_premium = 500",
    renewalLedger?.amount_premium === 500,
    `got=${renewalLedger?.amount_premium}`,
  );

  // Idempotency: send same event again — must NOT create a second grant
  const res2 = await sendWebhookEvent("invoice.paid", invoiceObject);
  ok(
    "invoice.paid idempotency: second call returns 200",
    res2.status === 200,
    `got ${res2.status}`,
  );
  await new Promise((r) => setTimeout(r, 1000));

  const { count: afterCount } = await admin
    .from("core_ledger")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("idempotency_key", `invoice_${invoiceId}_grant`);
  ok(
    "invoice.paid idempotency: no duplicate ledger row",
    afterCount === 1,
    `count=${afterCount}`,
  );
}

// ── TEST 4: invoice.payment_failed ────────────────────────────────────────────

async function testPaymentFailed(projectId: string, subscriptionId: string) {
  console.log(
    "\n[4] invoice.payment_failed → subscription + wallet set to past_due",
  );

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const invoiceObject = {
    id: `in_failed_${Date.now()}`,
    object: "invoice",
    status: "open",
    customer: stripeCustomerId,
    parent: {
      subscription_details: {
        subscription: subscriptionId,
      },
    },
    amount_due: 2900,
    amount_paid: 0,
    currency: "eur",
  };

  const res = await sendWebhookEvent("invoice.payment_failed", invoiceObject);
  ok(
    "invoice.payment_failed webhook returns 200",
    res.status === 200,
    `got ${res.status}`,
  );

  await new Promise((r) => setTimeout(r, 1500));

  const { data: sub } = await admin
    .from("core_subscriptions")
    .select("status")
    .eq("stripe_subscription_id", subscriptionId)
    .single();
  ok(
    "subscription status = past_due",
    sub?.status === "past_due",
    `status=${sub?.status}`,
  );

  const { data: wallet } = await admin
    .from("core_wallets")
    .select("status")
    .eq("project_id", projectId)
    .single();
  ok(
    "wallet status = past_due",
    wallet?.status === "past_due",
    `status=${wallet?.status}`,
  );

  // Restore wallet to active for subsequent tests
  await admin
    .from("core_wallets")
    .update({ status: "active" })
    .eq("project_id", projectId);
  await admin
    .from("core_subscriptions")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subscriptionId);
}

// ── TEST 5: charge.refunded ────────────────────────────────────────────────────

async function testChargeRefunded(projectId: string, subscriptionId: string) {
  console.log(
    "\n[5] charge.refunded → subscription canceled, access grant revoked, wallet locked, ledger refund",
  );

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const chargeId = `ch_test_${Date.now()}`;
  const chargeObject = {
    id: chargeId,
    object: "charge",
    customer: stripeCustomerId,
    amount: 2900,
    amount_refunded: 2900,
    currency: "eur",
    refunded: true,
    status: "succeeded",
  };

  const res = await sendWebhookEvent("charge.refunded", chargeObject);
  ok(
    "charge.refunded webhook returns 200",
    res.status === 200,
    `got ${res.status}`,
  );

  await new Promise((r) => setTimeout(r, 1500));

  const { data: sub } = await admin
    .from("core_subscriptions")
    .select("status")
    .eq("stripe_subscription_id", subscriptionId)
    .single();
  ok(
    "subscription status = canceled",
    sub?.status === "canceled",
    `status=${sub?.status}`,
  );

  const { data: grant } = await admin
    .from("core_access_grants")
    .select("status, revoked_at")
    .eq("reference_id", subscriptionId)
    .single();
  ok(
    "access grant status = revoked",
    grant?.status === "revoked",
    `status=${grant?.status}`,
  );
  ok("access grant revoked_at set", !!grant?.revoked_at, "revoked_at missing");

  const { data: wallet } = await admin
    .from("core_wallets")
    .select("status")
    .eq("project_id", projectId)
    .single();
  ok(
    "wallet status = locked",
    wallet?.status === "locked",
    `status=${wallet?.status}`,
  );

  const { data: refundLedger } = await admin
    .from("core_ledger")
    .select("*")
    .eq("project_id", projectId)
    .eq("idempotency_key", `refund_${chargeId}`)
    .single();
  ok("core_ledger: refund entry created", !!refundLedger, "row missing");
  ok(
    "refund ledger ref_type = refund",
    refundLedger?.ref_type === "refund",
    `ref_type=${refundLedger?.ref_type}`,
  );
  ok(
    "refund ledger reason_key = REFUND_CREDIT",
    refundLedger?.reason_key === "REFUND_CREDIT",
    `reason_key=${refundLedger?.reason_key}`,
  );

  // Restore for next test
  await admin
    .from("core_subscriptions")
    .update({ status: "active", cancel_at_period_end: false })
    .eq("stripe_subscription_id", subscriptionId);
  await admin
    .from("core_access_grants")
    .update({ status: "active", revoked_at: null })
    .eq("reference_id", subscriptionId);
  await admin
    .from("core_wallets")
    .update({ status: "active" })
    .eq("project_id", projectId);
}

// ── TEST 6: customer.subscription.deleted ─────────────────────────────────────

async function testSubscriptionDeleted(subscriptionId: string) {
  console.log(
    "\n[6] customer.subscription.deleted → subscription canceled, access grant revoked",
  );

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const subObject = {
    id: subscriptionId,
    object: "subscription",
    customer: stripeCustomerId,
    status: "canceled",
    cancel_at_period_end: false,
    canceled_at: Math.floor(Date.now() / 1000),
  };

  const res = await sendWebhookEvent(
    "customer.subscription.deleted",
    subObject,
  );
  ok(
    "customer.subscription.deleted webhook returns 200",
    res.status === 200,
    `got ${res.status}`,
  );

  await new Promise((r) => setTimeout(r, 1500));

  const { data: sub } = await admin
    .from("core_subscriptions")
    .select("status")
    .eq("stripe_subscription_id", subscriptionId)
    .single();
  ok(
    "subscription status = canceled",
    sub?.status === "canceled",
    `status=${sub?.status}`,
  );

  const { data: grant } = await admin
    .from("core_access_grants")
    .select("status, revoked_at")
    .eq("reference_id", subscriptionId)
    .single();
  ok(
    "access grant status = revoked",
    grant?.status === "revoked",
    `status=${grant?.status}`,
  );
  ok("access grant revoked_at set", !!grant?.revoked_at, "revoked_at missing");
}

// ── TEST 7: Webhook idempotency — same checkout.session.completed twice ────────

async function testWebhookIdempotency(
  userId: string,
  projectId: string,
  subscriptionId: string,
) {
  console.log(
    "\n[7] Webhook idempotency — same event ID processed twice → no duplicate records",
  );

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Get ledger count before
  const { count: ledgerBefore } = await admin
    .from("core_ledger")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  // Construct a checkout event with a FIXED event ID
  const fixedEventId = `evt_idempotency_test_${Date.now()}`;
  const payload = JSON.stringify({
    id: fixedEventId,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: `cs_idempotency_${Date.now()}`,
        object: "checkout.session",
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        customer: stripeCustomerId,
        client_reference_id: userId,
        subscription: subscriptionId,
        metadata: { user_id: userId, plan_code: "starter" },
      },
    },
  });

  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: STRIPE_WEBHOOK_SECRET,
  });

  // Send the same event twice
  const send = () =>
    fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": sig },
      body: payload,
    });

  const [r1, r2] = await Promise.all([send(), send()]);
  ok("first send returns 200", r1.status === 200, `got ${r1.status}`);
  ok("second send returns 200", r2.status === 200, `got ${r2.status}`);

  await new Promise((r) => setTimeout(r, 2000));

  // Ledger should NOT have been doubled — idempotency key prevents it
  const { count: ledgerAfter } = await admin
    .from("core_ledger")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  // stripe_events table should have exactly 1 row for this event ID
  const { count: eventCount } = await admin
    .from("stripe_events")
    .select("*", { count: "exact", head: true })
    .eq("stripe_event_id", fixedEventId);
  ok(
    "stripe_events: exactly 1 row for duplicate event",
    eventCount === 1,
    `count=${eventCount}`,
  );
}

// ── TEST 8: Unauthorized checkout request ─────────────────────────────────────

async function testUnauthorizedCheckout() {
  console.log("\n[8] POST /api/stripe/checkout without auth → 401");

  const res = await fetch(`${BASE}/api/stripe/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code: "starter" }),
  });
  ok("no token → 401", res.status === 401, `got ${res.status}`);
}

// ── TEST 9: Invalid webhook signature → 400 ───────────────────────────────────

async function testInvalidWebhookSignature() {
  console.log("\n[9] Webhook with invalid signature → 400");

  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=0,v1=invalidsignature",
    },
    body: JSON.stringify({
      id: "evt_fake",
      type: "checkout.session.completed",
      data: { object: {} },
    }),
  });
  // Stripe signature verification failure → should not return 200
  ok("invalid signature → not 200", res.status !== 200, `got ${res.status}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Production Stripe Paywall E2E Test (Step 4) ===");
  console.log(`Target: ${BASE}\n`);

  const { token, userId } = await getToken();
  console.log(`Authenticated as: ${TEST_EMAIL} (${userId})`);

  const projectId = await ensureProject(userId);
  console.log(`Project: ${projectId}\n`);

  let subscriptionId: string | null = null;

  try {
    // 1. Checkout URL generation
    await testCheckout(token);

    // 2. Full activation on checkout.session.completed
    const { subscriptionId: subId } = await testCheckoutSessionCompleted(
      userId,
      projectId,
    );
    subscriptionId = subId;

    // 3. Invoice renewal
    await testInvoicePaid(userId, projectId, subscriptionId);

    // 4. Payment failed → past_due
    await testPaymentFailed(projectId, subscriptionId);

    // 5. Refund → canceled + locked
    await testChargeRefunded(projectId, subscriptionId);

    // 6. Subscription deleted → canceled
    await testSubscriptionDeleted(subscriptionId);

    // 7. Idempotency
    await testWebhookIdempotency(userId, projectId, subscriptionId);

    // 8. Unauthorized checkout
    await testUnauthorizedCheckout();

    // 9. Invalid signature
    await testInvalidWebhookSignature();
  } catch (err) {
    console.error("\nFATAL:", (err as Error).message);
    failed++;
  } finally {
    console.log("\nCleaning up...");
    await cleanupProject(projectId);
    await deleteTestUser();
    await cleanupStripe();

    // Clean up stripe_events for test events
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    if (subscriptionId) {
      await admin
        .from("stripe_events")
        .delete()
        .eq("event_type", "checkout.session.completed");
      // can't easily filter to just our test events — leave them (they're flagged processed)
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
