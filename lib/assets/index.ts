/**
 * lib/assets/index.ts
 * Brief 12: Content Assets Inventory
 *
 * Centralized module for managing content assets (core_assets + core_outputs).
 * Provides CRUD, versioning, lifecycle transitions, and inventory queries.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateContent, extractPreview } from "./schemas";

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// TYPES
// ============================================================================

export type AssetStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export type AssetType =
  | "content_piece"
  | "reel_script"
  | "carousel"
  | "story"
  | "thread"
  | "newsletter"
  | "podcast_notes"
  | "video_script"
  | "batch_item";

export interface ContentAsset {
  id: string;
  project_id: string;
  asset_type: string;
  content: Record<string, unknown>;
  status: AssetStatus;
  version: number;
  parent_asset_id: string | null;
  mission_instance_id: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAssetInput {
  project_id: string;
  asset_type: string;
  content: Record<string, unknown>;
  status?: AssetStatus;
  mission_instance_id?: string;
  platform?: string;
  parent_asset_id?: string;
}

export interface ListAssetsInput {
  project_id: string;
  asset_type?: string;
  status?: AssetStatus | AssetStatus[];
  platform?: string;
  limit?: number;
  offset?: number;
}

export interface AssetStats {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  by_platform: Record<string, number>;
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new content asset with validation.
 * Returns the created asset ID.
 */
export async function createAsset(
  admin: AdminClient,
  input: CreateAssetInput,
): Promise<string> {
  const validation = validateContent(input.content);
  const sanitizedContent = validation.success ? validation.data : input.content;

  const { data, error } = await admin
    .from("core_assets")
    .insert({
      project_id: input.project_id,
      asset_type: input.asset_type,
      content: sanitizedContent,
      status: input.status ?? "draft",
      version: 1,
      parent_asset_id: input.parent_asset_id ?? null,
      mission_instance_id: input.mission_instance_id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create asset: ${error?.message ?? "unknown error"}`,
    );
  }

  return data.id as string;
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get a single asset by ID.
 */
export async function getAsset(
  admin: AdminClient,
  assetId: string,
  projectId: string,
): Promise<ContentAsset | null> {
  const { data } = await admin
    .from("core_assets")
    .select("*")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .single();

  return data as ContentAsset | null;
}

/**
 * List assets for a project with optional filters.
 */
export async function listAssets(
  admin: AdminClient,
  input: ListAssetsInput,
): Promise<ContentAsset[]> {
  let query = admin
    .from("core_assets")
    .select("*")
    .eq("project_id", input.project_id)
    .order("created_at", { ascending: false });

  if (input.asset_type) {
    query = query.eq("asset_type", input.asset_type);
  }

  if (input.status) {
    if (Array.isArray(input.status)) {
      query = query.in("status", input.status);
    } else {
      query = query.eq("status", input.status);
    }
  }

  if (input.platform) {
    query = query.eq("platform", input.platform);
  }

  if (input.limit) {
    const from = input.offset ?? 0;
    query = query.range(from, from + input.limit - 1);
  }

  const { data } = await query;
  return (data ?? []) as ContentAsset[];
}

/**
 * Get all versions of an asset (by parent_asset_id chain).
 */
export async function getAssetVersions(
  admin: AdminClient,
  assetId: string,
  projectId: string,
): Promise<ContentAsset[]> {
  // Find root asset
  const asset = await getAsset(admin, assetId, projectId);
  if (!asset) return [];

  const rootId = asset.parent_asset_id ?? assetId;

  const { data } = await admin
    .from("core_assets")
    .select("*")
    .eq("project_id", projectId)
    .or(`id.eq.${rootId},parent_asset_id.eq.${rootId}`)
    .order("version", { ascending: true });

  return (data ?? []) as ContentAsset[];
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update asset content. Does NOT create a new version — use forkAsset for versioning.
 */
export async function updateAsset(
  admin: AdminClient,
  assetId: string,
  projectId: string,
  updates: {
    content?: Record<string, unknown>;
    status?: AssetStatus;
    platform?: string;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.content !== undefined) {
    const validation = validateContent(updates.content);
    payload.content = validation.success ? validation.data : updates.content;
  }

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  if (updates.platform !== undefined) {
    payload.platform = updates.platform;
  }

  await admin
    .from("core_assets")
    .update(payload)
    .eq("id", assetId)
    .eq("project_id", projectId);
}

// ============================================================================
// LIFECYCLE TRANSITIONS
// ============================================================================

const VALID_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  draft: ["review", "approved", "archived"],
  review: ["draft", "approved", "archived"],
  approved: ["scheduled", "published", "archived"],
  scheduled: ["published", "approved", "archived"],
  published: ["archived"],
  archived: [],
};

/**
 * Transition an asset to a new status.
 * Enforces valid lifecycle transitions.
 */
export async function transitionAsset(
  admin: AdminClient,
  assetId: string,
  projectId: string,
  newStatus: AssetStatus,
): Promise<{ success: boolean; error?: string }> {
  const asset = await getAsset(admin, assetId, projectId);
  if (!asset) return { success: false, error: "Asset not found" };

  const allowed = VALID_TRANSITIONS[asset.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from "${asset.status}" to "${newStatus}". Allowed: ${allowed.join(", ") || "none"}`,
    };
  }

  await updateAsset(admin, assetId, projectId, { status: newStatus });
  return { success: true };
}

// ============================================================================
// VERSIONING (fork)
// ============================================================================

/**
 * Fork an asset to create a new version with edited content.
 * The original is kept; the new version has version+1 and parent_asset_id set.
 */
export async function forkAsset(
  admin: AdminClient,
  assetId: string,
  projectId: string,
  newContent: Record<string, unknown>,
): Promise<string> {
  const original = await getAsset(admin, assetId, projectId);
  if (!original) throw new Error("Asset not found");

  const rootId = original.parent_asset_id ?? original.id;

  // Get max version for this asset tree
  const { data: versions } = await admin
    .from("core_assets")
    .select("version")
    .eq("project_id", projectId)
    .or(`id.eq.${rootId},parent_asset_id.eq.${rootId}`)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = ((versions?.[0]?.version as number | undefined) ?? 1) + 1;

  const validation = validateContent(newContent);
  const sanitized = validation.success ? validation.data : newContent;

  const { data, error } = await admin
    .from("core_assets")
    .insert({
      project_id: projectId,
      asset_type: original.asset_type,
      content: sanitized,
      status: "draft",
      version: nextVersion,
      parent_asset_id: rootId,
      mission_instance_id: original.mission_instance_id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to fork asset: ${error?.message ?? "unknown error"}`,
    );
  }

  return data.id as string;
}

// ============================================================================
// BULK OPERATIONS (for batch missions)
// ============================================================================

/**
 * Create multiple assets from a batch mission output.
 * Returns array of created asset IDs.
 */
export async function createBatchAssets(
  admin: AdminClient,
  projectId: string,
  items: Array<{
    asset_type: string;
    content: Record<string, unknown>;
    mission_instance_id?: string;
  }>,
): Promise<string[]> {
  if (items.length === 0) return [];

  const rows = items.map((item) => {
    const validation = validateContent(item.content);
    return {
      project_id: projectId,
      asset_type: item.asset_type,
      content: validation.success ? validation.data : item.content,
      status: "draft" as AssetStatus,
      version: 1,
      mission_instance_id: item.mission_instance_id ?? null,
      parent_asset_id: null,
    };
  });

  const { data, error } = await admin
    .from("core_assets")
    .insert(rows)
    .select("id");

  if (error) {
    throw new Error(`Failed to create batch assets: ${error.message}`);
  }

  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

// ============================================================================
// INVENTORY STATS
// ============================================================================

/**
 * Get inventory stats for a project.
 */
export async function getAssetStats(
  admin: AdminClient,
  projectId: string,
): Promise<AssetStats> {
  const { data } = await admin
    .from("core_assets")
    .select("status, asset_type, content")
    .eq("project_id", projectId);

  const assets = (data ?? []) as Array<{
    status: string;
    asset_type: string;
    content: Record<string, unknown>;
  }>;

  const by_status: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  const by_platform: Record<string, number> = {};

  for (const a of assets) {
    by_status[a.status] = (by_status[a.status] ?? 0) + 1;
    by_type[a.asset_type] = (by_type[a.asset_type] ?? 0) + 1;
    const platform = (a.content as Record<string, unknown>)["platform"] as
      | string
      | undefined;
    if (platform) {
      by_platform[platform] = (by_platform[platform] ?? 0) + 1;
    }
  }

  return {
    total: assets.length,
    by_status,
    by_type,
    by_platform,
  };
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Search assets by hook/caption text (simple ilike search).
 */
export async function searchAssets(
  admin: AdminClient,
  projectId: string,
  query: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    asset_type: string;
    preview: string;
    status: string;
    created_at: string;
  }>
> {
  const { data } = await admin
    .from("core_assets")
    .select("id, asset_type, content, status, created_at")
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit * 3); // over-fetch, filter in memory

  const results = (data ?? []) as Array<{
    id: string;
    asset_type: string;
    content: Record<string, unknown>;
    status: string;
    created_at: string;
  }>;

  const q = query.toLowerCase();
  return results
    .filter((a) => {
      const preview = extractPreview(a.content).toLowerCase();
      return preview.includes(q);
    })
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      asset_type: a.asset_type,
      preview: extractPreview(a.content),
      status: a.status,
      created_at: a.created_at,
    }));
}

// Re-export schemas and helpers
export * from "./schemas";
