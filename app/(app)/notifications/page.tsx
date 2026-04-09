import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { makeServerT } from "@/lib/i18n.server";
import { resolveLocale } from "@/i18n.config";
import MarkReadButton from "./MarkReadButton";

const TYPE_ICON: Record<string, string> = {
  mission_reminder: "🎯",
  publish_success: "✅",
  publish_failed: "❌",
  weekly_digest: "📊",
  capability_followup: "⚡",
};

type Notification = {
  id: string;
  type: string;
  read_at: string | null;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

export default async function NotificationsPage() {
  const cookieStore = cookies();
  const locale = resolveLocale(cookieStore.get("NEXT_LOCALE")?.value);
  const messages = (await import(`@/messages/${locale}/notifications.json`))
    .default as Record<string, unknown>;
  const t = makeServerT(messages);

  function formatTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return t("just_now");
    if (diffH < 24) return t("hours_ago", { hours: diffH });
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return t("days_ago", { days: diffD });
    return new Date(iso).toLocaleDateString(locale);
  }

  function getNotifTitle(n: Notification): string {
    return t(`types.${n.type}.title`);
  }

  function getNotifBody(n: Notification): string {
    const meta = (n.metadata_json ?? {}) as Record<string, unknown>;

    if (n.type === "mission_reminder") {
      const template = String(meta.template_code ?? "")
        .replace(/_V\d+$/, "")
        .replace(/_/g, " ")
        .toLowerCase();
      return t("types.mission_reminder.body", { template });
    }

    if (n.type === "publish_success") {
      return t("types.publish_success.body", {
        platform: String(meta.platform ?? ""),
        content_type: String(meta.content_type ?? ""),
      });
    }

    if (n.type === "publish_failed") {
      return t("types.publish_failed.body", {
        platform: String(meta.platform ?? ""),
      });
    }

    if (n.type === "weekly_digest") {
      const delta = Number(meta.followerDelta ?? 0);
      return t("types.weekly_digest.body", {
        missions: String(meta.missionsCompleted ?? 0),
        posts: String(meta.contentPublished ?? 0),
        followers_delta: `${delta >= 0 ? "+" : ""}${delta}`,
      });
    }

    return t(`types.${n.type}.body`);
  }

  const supabaseRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ).hostname.split(".")[0];
  const authCookie = cookieStore.get(`sb-${supabaseRef}-auth-token`);
  const admin = createAdminClient();

  let user = null;
  if (authCookie?.value?.startsWith("base64-")) {
    try {
      const session = JSON.parse(
        Buffer.from(authCookie.value.slice(7), "base64").toString("utf-8"),
      ) as { access_token?: string };
      if (session.access_token) {
        const { data } = await admin.auth.getUser(session.access_token);
        user = data.user;
      }
    } catch {
      user = null;
    }
  }
  if (!user) redirect("/login");

  const { data: notifications } = await admin
    .from("notifications")
    .select("id, type, read_at, created_at, metadata_json")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = (notifications ?? []) as Notification[];
  const unread = items.filter((n) => !n.read_at);

  return (
    <div className="text-white max-w-2xl mx-auto px-4 pt-6 pb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          {unread.length > 0 && (
            <p className="text-zinc-500 text-sm mt-0.5">
              {t("unread", { count: unread.length })}
            </p>
          )}
        </div>
        {unread.length > 0 && <MarkReadButton ids={unread.map((n) => n.id)} />}
      </div>

      {items.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-10 border border-zinc-800 text-center">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-zinc-300 font-medium">{t("no_notifications")}</p>
          <p className="text-zinc-500 text-sm mt-1">
            {t("no_notifications_sub")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className={`bg-zinc-900 rounded-xl p-4 border transition-colors ${
                n.read_at
                  ? "border-zinc-800 opacity-60"
                  : "border-violet-800/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">
                  {TYPE_ICON[n.type] ?? "📬"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white">
                      {getNotifTitle(n)}
                    </p>
                    {!n.read_at && (
                      <span className="w-2 h-2 bg-violet-500 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 leading-snug">
                    {getNotifBody(n)}
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {formatTime(n.created_at)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
