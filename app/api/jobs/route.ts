/**
 * app/api/jobs/route.ts
 * Brief 16: Lab Job Queue API
 *
 * POST /api/jobs  - enqueue a lab job
 * GET  /api/jobs  - list jobs for project
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { enqueueJob, logEvent, generateCorrelationId } from "@/lib/operations";

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
    lab_key: string;
    action_key: string;
    request_json: Record<string, unknown>;
    idempotency_key: string;
    mission_instance_id?: string;
    max_attempts?: number;
  };

  if (!body.lab_key || !body.action_key || !body.idempotency_key) {
    return NextResponse.json(
      { error: "lab_key, action_key, and idempotency_key are required" },
      { status: 400 },
    );
  }

  const correlationId = generateCorrelationId();

  const result = await enqueueJob(admin, {
    project_id: project.id,
    lab_key: body.lab_key,
    action_key: body.action_key,
    request_json: body.request_json ?? {},
    idempotency_key: body.idempotency_key,
    mission_instance_id: body.mission_instance_id,
    max_attempts: body.max_attempts,
  });

  await logEvent(
    admin,
    "job_enqueued",
    "edge",
    correlationId,
    {
      job_id: result.job_id,
      action_key: body.action_key,
      created: result.created,
    },
    { project_id: project.id },
  );

  return NextResponse.json(
    { ...result, correlation_id: correlationId },
    { status: result.created ? 201 : 200 },
  );
}

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
  const status = searchParams.get("status") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "20");

  let query = admin
    .from("core_lab_jobs")
    .select(
      "job_id, lab_key, action_key, status, attempt, created_at, updated_at",
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return NextResponse.json({ jobs: data ?? [] });
}
