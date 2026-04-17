/**
 * app/api/assets/search/route.ts
 * Brief 12: Asset text search
 *
 * GET /api/assets/search?q=text
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { searchAssets } from "@/lib/assets";

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
  const q = searchParams.get("q") ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "20");

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchAssets(admin, project.id, q, limit);
  return NextResponse.json({ results });
}
