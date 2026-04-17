/**
 * app/api/experiments/[id]/route.ts
 * Brief 15: Single experiment operations
 *
 * GET   /api/experiments/:id          - get experiment + variants
 * POST  /api/experiments/:id/start    - start experiment
 * POST  /api/experiments/:id/complete - complete & select winner
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import {
  getExperiment,
  startExperiment,
  completeExperiment,
  getExperimentItems,
  addExperimentItem,
} from "@/lib/experiments";
import type { AddExperimentItemInput } from "@/lib/experiments/types";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const result = await getExperiment(admin, params.id, project.id);
  if (!result)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const includeItems = searchParams.get("items") === "true";

  const items = includeItems
    ? await getExperimentItems(admin, params.id)
    : undefined;

  return NextResponse.json({
    ...result,
    ...(items !== undefined ? { items } : {}),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
  const action = searchParams.get("action");

  if (action === "start") {
    await startExperiment(admin, params.id, project.id);
    return NextResponse.json({ started: true });
  }

  if (action === "complete") {
    const result = await completeExperiment(admin, params.id, project.id);
    return NextResponse.json(result);
  }

  if (action === "add_item") {
    const body = (await req.json()) as Omit<
      AddExperimentItemInput,
      "experiment_id"
    >;
    const itemId = await addExperimentItem(admin, {
      ...body,
      experiment_id: params.id,
    });
    return NextResponse.json({ experiment_item_id: itemId }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Unknown action. Use ?action=start|complete|add_item" },
    { status: 400 },
  );
}
