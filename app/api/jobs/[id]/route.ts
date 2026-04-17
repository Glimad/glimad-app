/**
 * app/api/jobs/[id]/route.ts
 * Brief 16: Single job status
 *
 * GET /api/jobs/:id - get job status
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { getJob } from "@/lib/operations";

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

  const job = await getJob(admin, params.id);
  if (!job || job.project_id !== project.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return job without internal error details for security
  const { error_json: _err, ...safeJob } = job;
  return NextResponse.json({
    job: {
      ...safeJob,
      has_error: !!_err,
    },
  });
}
