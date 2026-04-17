/**
 * app/api/experiments/route.ts
 * Brief 15: Experiments API
 *
 * GET  /api/experiments  - list experiments
 * POST /api/experiments  - create experiment
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { createExperiment, listExperiments } from "@/lib/experiments";
import type { CreateExperimentInput } from "@/lib/experiments/types";

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

  const experiments = await listExperiments(admin, project.id, status);
  return NextResponse.json({ experiments });
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

  const body = (await req.json()) as Omit<CreateExperimentInput, "project_id">;

  if (
    !body.hypothesis ||
    !body.experiment_type ||
    !body.metric_primary ||
    !body.timeframe_days ||
    !body.success_criteria
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const experimentId = await createExperiment(admin, {
    ...body,
    project_id: project.id,
  });

  return NextResponse.json({ experiment_id: experimentId }, { status: 201 });
}
