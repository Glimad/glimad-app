import { createAdminClient } from "@/lib/supabase/admin";

export function extractToken(request: Request): string | null {
  // 1. Bearer token in Authorization header (API/programmatic access)
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 2. Supabase session cookie (browser/SSR access).
  //    @supabase/ssr stores the session JSON as either a single cookie
  //      sb-<ref>-auth-token=base64-<payload>
  //    or — when the JWT is large — chunked across indexed cookies
  //      sb-<ref>-auth-token.0=base64-<chunk0>
  //      sb-<ref>-auth-token.1=<chunk1>
  //      …
  //    Only the first chunk carries the `base64-` prefix; subsequent chunks
  //    are raw continuation. We must try both forms.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const supabaseRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ).hostname.split(".")[0];
  const baseName = `sb-${supabaseRef}-auth-token`;

  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1);
    if (name) cookies[name] = decodeURIComponent(value);
  }

  let raw: string | null = null;
  if (cookies[baseName]) {
    raw = cookies[baseName];
  } else if (cookies[`${baseName}.0`]) {
    const chunks: string[] = [];
    for (let i = 0; cookies[`${baseName}.${i}`]; i++) {
      chunks.push(cookies[`${baseName}.${i}`]);
    }
    raw = chunks.join("");
  }
  if (!raw) return null;

  const payload = raw.startsWith("base64-") ? raw.slice(7) : raw;

  try {
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    // Some clients store the JSON directly (not base64-wrapped) — try plain parse
    try {
      const parsed = JSON.parse(payload) as { access_token?: string };
      return parsed.access_token ?? null;
    } catch {
      return null;
    }
  }
}

export async function getAuthUser(request: Request) {
  const token = extractToken(request);
  if (!token) return null;
  const admin = createAdminClient();
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  return user ?? null;
}
