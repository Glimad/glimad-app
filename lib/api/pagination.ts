/**
 * lib/api/pagination.ts
 * Brief 27: API Reference — Cursor-based pagination helpers
 *
 * All list endpoints use cursor-based pagination, not offset.
 * Cursor = base64-encoded ISO timestamp of the last item.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PaginationParams {
  cursor?: string | null;
  limit?: number;
}

export interface PaginationResult<T> {
  items: T[];
  cursor: string | null;
  has_more: boolean;
}

// ============================================================================
// CURSOR ENCODING
// ============================================================================

/**
 * Encode a cursor value (typically a timestamp or UUID) to base64.
 */
export function encodeCursor(value: string): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * Decode a base64 cursor back to its raw value.
 * Returns null if decoding fails (invalid cursor).
 */
export function decodeCursor(cursor: string): string | null {
  try {
    return Buffer.from(cursor, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Parse pagination params from URL searchParams.
 * Enforces max limit of 100.
 */
export function parsePagination(
  searchParams: URLSearchParams,
): PaginationParams {
  const cursor = searchParams.get("cursor") ?? null;
  const limitStr = searchParams.get("limit");
  const limit = Math.min(
    limitStr ? Math.max(1, parseInt(limitStr, 10)) : 20,
    100,
  );
  return { cursor, limit };
}

/**
 * Build a paginated result from a list of items.
 * Assumes items are ordered (most recent first or last).
 * Pass limit+1 items from DB, this function trims and builds cursor.
 *
 * @param rawItems  Fetch limit+1 items from DB
 * @param limit     The requested limit
 * @param getCursorValue  Function to extract cursor value from an item
 */
export function buildPaginatedResult<T>(
  rawItems: T[],
  limit: number,
  getCursorValue: (item: T) => string,
): PaginationResult<T> {
  const has_more = rawItems.length > limit;
  const items = has_more ? rawItems.slice(0, limit) : rawItems;
  const lastItem = items[items.length - 1];
  const cursor =
    lastItem && has_more ? encodeCursor(getCursorValue(lastItem)) : null;

  return { items, cursor, has_more };
}

/**
 * Apply cursor filter to a Supabase query (created_at-based pagination).
 * Returns a query with the cursor filter applied.
 */
export function applyCursorFilter<
  Q extends {
    lt: (col: string, val: string) => Q;
  },
>(query: Q, cursor: string | null, column = "created_at"): Q {
  if (!cursor) return query;
  const decoded = decodeCursor(cursor);
  if (!decoded) return query;
  return query.lt(column, decoded);
}
