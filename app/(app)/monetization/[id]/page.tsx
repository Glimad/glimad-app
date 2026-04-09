import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { computeProductHealth } from "@/lib/monetization";
import { makeServerT } from "@/lib/i18n.server";
import { resolveLocale } from "@/i18n.config";
import AddEventForm from "./AddEventForm";
import Link from "next/link";

const HEALTH_COLOR: Record<string, string> = {
  green: "text-emerald-400 bg-emerald-900/30",
  amber: "text-amber-400 bg-amber-900/30",
  red: "text-red-400 bg-red-900/30",
};

const HEALTH_BAR: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = cookies();
  const locale = resolveLocale(cookieStore.get("NEXT_LOCALE")?.value);
  const messages = (await import(`@/messages/${locale}/monetization.json`))
    .default as Record<string, unknown>;
  const t = makeServerT(messages);

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

  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .single();

  if (!project) redirect("/dashboard");

  const { data: product } = await admin
    .from("monetization_products")
    .select("*")
    .eq("id", params.id)
    .eq("project_id", project.id)
    .single();

  if (!product) notFound();

  const [eventsResult, health] = await Promise.all([
    admin
      .from("monetization_events")
      .select("*")
      .eq("product_id", params.id)
      .order("event_date", { ascending: false })
      .limit(50),
    computeProductHealth(admin, project.id, params.id),
  ]);

  const events = eventsResult.data ?? [];
  const totalRevenue = events
    .filter((e) => e.event_type === "sale")
    .reduce((s, e) => s + Number(e.amount), 0);

  const typeKey = `product_types.${product.type}`;
  const productTypeLabel =
    t(typeKey) !== typeKey ? t(typeKey) : product.type.replace("_", " ");

  return (
    <div className="text-white max-w-3xl mx-auto px-4 pt-6 pb-12">
      <div className="flex items-center gap-2 text-zinc-500 text-sm mb-6">
        <Link href="/monetization" className="hover:text-zinc-300">
          {t("breadcrumb")}
        </Link>
        <span>›</span>
        <span className="text-white">{product.name}</span>
      </div>

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{product.name}</h1>
            <p className="text-zinc-500 text-sm mt-0.5 capitalize">
              {productTypeLabel}
            </p>
          </div>
          {health && (
            <span
              className={`text-sm font-bold px-3 py-1.5 rounded-full ${HEALTH_COLOR[health.color]}`}
            >
              {health.health}/100
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {product.price_amount != null && (
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">{t("price_label")}</p>
              <p className="font-semibold">
                €{product.price_amount} {product.price_currency}
              </p>
            </div>
          )}
          {product.platform && (
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">
                {t("platform_label")}
              </p>
              <p className="font-semibold capitalize">{product.platform}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">
              {t("kpi_total_revenue")}
            </p>
            <p className="font-semibold text-emerald-400">
              €{totalRevenue.toFixed(0)}
            </p>
          </div>
        </div>

        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 text-sm"
          >
            {product.url}
          </a>
        )}
        {product.notes && (
          <p className="text-zinc-500 text-sm mt-2">{product.notes}</p>
        )}
      </div>

      {health && (
        <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">
            {t("health_score")}
          </h2>
          <div className="space-y-3">
            {Object.entries(health.dimensions).map(([dim, score]) => (
              <div key={dim}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400 capitalize">{dim}</span>
                  <span className="text-zinc-400">{score}/100</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${HEALTH_BAR[health.color]}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">
          {t("log_event_section")}
        </h2>
        <AddEventForm productId={params.id} />
      </div>

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">
          {t("revenue_history")}
        </h2>
        {events.length === 0 ? (
          <p className="text-zinc-600 text-sm">{t("no_events")}</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const evTypeKey = `event_types.${event.event_type}`;
              const evTypeLabel =
                t(evTypeKey) !== evTypeKey
                  ? t(evTypeKey)
                  : event.event_type.replace("_", " ");
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {evTypeLabel}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {event.event_date}
                      {event.note ? ` · ${event.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold text-sm ${event.event_type === "refund" ? "text-red-400" : "text-emerald-400"}`}
                    >
                      {event.event_type === "refund" ? "-" : "+"}€
                      {Number(event.amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-zinc-600 capitalize">
                      {event.source}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
