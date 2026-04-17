/**
 * app/api/experiments/analytics/route.ts
 * Brief 15: Analytics events + cost metrics API
 *
 * GET  /api/experiments/analytics         - get analytics events
 * POST /api/experiments/analytics         - track analytics event
 * GET  /api/experiments/analytics?type=costs - get cost metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import {
  trackEvent,
  getAnalyticsEvents,
  getCostMetrics,
  recordCostMetrics,
} from "@/lib/experiments";
import type { AnalyticsEventType } from "@/lib/experiments/types";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .single();
  if (!project)
    return NextResponse.json({ error: "No project" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  if (type === "costs") {
    const period = (searchParams.get("period") ?? undefined) as
      | "daily"
      | "weekly"
      | "monthly"
      | undefined;
    const limit = parseInt(searchParams.get("limit") ?? "12");
    const costs = await getCostMetrics(admin, project.id, period, limit);
    return NextResponse.json({ costs });
  }

  const eventType = (searchParams.get("event_type") ?? undefined) as
    | AnalyticsEventType
    | undefined;
  const since = searchParams.get("since") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "100");

  const events = await getAnalyticsEvents(
    admin,
    project.id,
    eventType,
    since,
    limit,
  );
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .single();
  if (!project)
    return NextResponse.json({ error: "No project" }, { status: 404 });

  const body = (await req.json()) as {
    type?: string;
    event_type?: AnalyticsEventType;
    properties?: Record<string, unknown>;
    period?: "daily" | "weekly" | "monthly";
    period_start?: string;
    credits_spent_total?: number;
    credits_spent_by_lab?: Record<string, number>;
    outputs_count?: number;
    published_count?: number;
    follower_delta?: number;
    click_delta?: number;
    revenue_delta?: number;
  };

  // Record cost metrics
  if (body.type === "cost_metrics") {
    if (
      !body.period ||
      !body.period_start ||
      body.credits_spent_total === undefined
    ) {
      return NextResponse.json(
        { error: "period, period_start and credits_spent_total required" },
        { status: 400 },
      );
    }
    await recordCostMetrics(admin, project.id, body.period, body.period_start, {
      credits_spent_total: body.credits_spent_total,
      credits_spent_by_lab: body.credits_spent_by_lab,
      outputs_count: body.outputs_count,
      published_count: body.published_count,
      follower_delta: body.follower_delta,
      click_delta: body.click_delta,
      revenue_delta: body.revenue_delta,
    });
    return NextResponse.json({ recorded: true });
  }

  // Track analytics event
  if (!body.event_type) {
    return NextResponse.json({ error: "event_type required" }, { status: 400 });
  }

  await trackEvent(admin, body.event_type, body.properties ?? {}, {
    project_id: project.id,
    user_id: user.id,
  });

  return NextResponse.json({ tracked: true });
}
