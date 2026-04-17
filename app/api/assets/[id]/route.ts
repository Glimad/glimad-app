/**
 * app/api/assets/[id]/route.ts
 * Brief 12: Single asset operations
 *
 * GET    /api/assets/:id          - get asset
 * PATCH  /api/assets/:id          - update asset content/status
 * DELETE /api/assets/:id          - archive asset
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/extract-token";
import {
  getAsset,
  updateAsset,
  transitionAsset,
  forkAsset,
  getAssetVersions,
  type AssetStatus,
} from "@/lib/assets";

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

  const { searchParams } = new URL(req.url);
  const versions = searchParams.get("versions") === "true";

  if (versions) {
    const history = await getAssetVersions(admin, params.id, project.id);
    return NextResponse.json({ versions: history });
  }

  const asset = await getAsset(admin, params.id, project.id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ asset });
}

export async function PATCH(
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

  const body = (await req.json()) as {
    content?: Record<string, unknown>;
    status?: AssetStatus;
    platform?: string;
    fork?: boolean;
  };

  // Fork creates a new versioned copy
  if (body.fork && body.content) {
    const newId = await forkAsset(admin, params.id, project.id, body.content);
    return NextResponse.json({ asset_id: newId, forked: true });
  }

  // Status transition (lifecycle)
  if (body.status && !body.content && !body.platform) {
    const result = await transitionAsset(
      admin,
      params.id,
      project.id,
      body.status,
    );
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ status: body.status });
  }

  // General update
  await updateAsset(admin, params.id, project.id, {
    content: body.content,
    status: body.status,
    platform: body.platform,
  });

  return NextResponse.json({ updated: true });
}

export async function DELETE(
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

  // Archive instead of hard delete
  const result = await transitionAsset(
    admin,
    params.id,
    project.id,
    "archived",
  );
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ archived: true });
}
