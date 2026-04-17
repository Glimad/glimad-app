/**
 * app/api/assets/route.ts
 * Brief 12: Content Assets Inventory API
 *
 * GET  /api/assets          - list assets
 * POST /api/assets          - create asset
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import {
  createAsset,
  listAssets,
  getAssetStats,
  type AssetStatus,
} from "@/lib/assets";

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
  const asset_type = searchParams.get("asset_type") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const platform = searchParams.get("platform") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const stats_only = searchParams.get("stats") === "true";

  if (stats_only) {
    const stats = await getAssetStats(admin, project.id);
    return NextResponse.json({ stats });
  }

  const assets = await listAssets(admin, {
    project_id: project.id,
    asset_type,
    status: status as AssetStatus | undefined,
    platform,
    limit,
    offset,
  });

  return NextResponse.json({ assets });
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
    asset_type: string;
    content: Record<string, unknown>;
    status?: AssetStatus;
    mission_instance_id?: string;
    platform?: string;
  };

  if (!body.asset_type || !body.content) {
    return NextResponse.json(
      { error: "asset_type and content are required" },
      { status: 400 },
    );
  }

  const assetId = await createAsset(admin, {
    project_id: project.id,
    asset_type: body.asset_type,
    content: body.content,
    status: body.status ?? "draft",
    mission_instance_id: body.mission_instance_id,
    platform: body.platform,
  });

  return NextResponse.json({ asset_id: assetId }, { status: 201 });
}
