/**
 * app/api/experiments/winners/route.ts
 * Brief 15: Performance winners + learnings API
 *
 * GET /api/experiments/winners          - get performance winners
 * GET /api/experiments/winners?type=learnings - get active learnings
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { getPerformanceWinners, getActiveLearnings } from "@/lib/experiments";

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
  const platform = searchParams.get("platform") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const phase = searchParams.get("phase") ?? undefined;
  const format = searchParams.get("format") ?? undefined;

  if (type === "learnings") {
    const learnings = await getActiveLearnings(admin, project.id, {
      platform,
      format,
      phase,
    });
    return NextResponse.json({ learnings });
  }

  const winners = await getPerformanceWinners(
    admin,
    project.id,
    platform,
    category,
  );
  return NextResponse.json({ winners });
}
