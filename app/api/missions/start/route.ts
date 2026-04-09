import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { createMissionInstance, executeMission } from "@/lib/missions/runner";
import { onMissionStart } from "@/lib/gamification";
import { resolveLocale } from "@/i18n.config";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template_code } = await req.json();

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .single();

  if (!project)
    return NextResponse.json({ error: "No project" }, { status: 404 });

  const locale = resolveLocale(req.cookies.get("NEXT_LOCALE")?.value);

  await onMissionStart(admin, project.id);
  const instanceId = await createMissionInstance(
    admin,
    project.id,
    template_code,
  );

  // Execute mission synchronously — runs until completed or waiting_input
  await executeMission(admin, instanceId, locale);

  return NextResponse.json({ instance_id: instanceId });
}
