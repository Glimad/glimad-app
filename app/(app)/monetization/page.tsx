import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getMonetizationKpis, computeProductHealth } from "@/lib/monetization";
import { makeServerT } from "@/lib/i18n";
import { resolveLocale } from "@/i18n.config";
import Link from "next/link";
import AiSuggestionCard from "@/components/monetization/AiSuggestionCard";

const HEALTH_COLOR: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export default async function MonetizationPage({
  searchParams,
}: {
  searchParams?: { status?: string };
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
    .select("id, phase_code, active_mode")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .single();

  if (!project) redirect("/dashboard");

  const activeFilter = searchParams?.status;
  let productsQuery = admin
    .from("monetization_products")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });
  if (
    activeFilter === "active" ||
    activeFilter === "paused" ||
    activeFilter === "archived"
  ) {
    productsQuery = productsQuery.eq("status", activeFilter);
  } else {
    productsQuery = productsQuery.neq("status", "archived");
  }
  const { data: products } = await productsQuery;

  const kpis = await getMonetizationKpis(admin, project.id);

  const productsWithHealth = await Promise.all(
    (products ?? []).map(async (p) => {
      const health = await computeProductHealth(admin, project.id, p.id);
      return { ...p, health };
    }),
  );

  const { data: latestEvents } = await admin
    .from("monetization_events")
    .select("product_id, event_date")
    .eq("project_id", project.id)
    .order("event_date", { ascending: false });

  const latestEventByProduct = new Map<string, string>();
  for (const e of latestEvents ?? []) {
    if (e.product_id && !latestEventByProduct.has(e.product_id)) {
      latestEventByProduct.set(e.product_id, e.event_date);
    }
  }

  const PHASE_RANK: Record<string, number> = {
    F0: 0,
    F1: 1,
    F2: 2,
    F3: 3,
    F4: 4,
    F5: 5,
    F6: 6,
    F7: 7,
  };
  const phaseRank = PHASE_RANK[project.phase_code ?? "F0"] ?? 0;
  if (phaseRank < 3) redirect("/dashboard");
  const showAiSuggestion = phaseRank >= 3 && project.active_mode === "monetize";

  return (
    <div className="text-white max-w-5xl mx-auto px-4 pt-6 pb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{t("subtitle")}</p>
        </div>
        <Link
          href="/monetization/new"
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
        >
          {t("add_product")}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">{t("kpi_total_revenue")}</p>
          <p className="text-2xl font-bold">€{kpis.totalRevenue.toFixed(0)}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">{t("kpi_this_month")}</p>
          <p className="text-2xl font-bold">
            €{kpis.thisMonthRevenue.toFixed(0)}
          </p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">{t("kpi_mrr")}</p>
          <p className="text-2xl font-bold">€{kpis.mrr.toFixed(0)}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">
            {t("kpi_active_streams")}
          </p>
          <p className="text-2xl font-bold">{kpis.activeStreams}</p>
        </div>
      </div>

      {showAiSuggestion && <AiSuggestionCard />}

      <div className="mb-4 flex gap-2">
        {[
          { key: "active", label: t("status_active") },
          { key: "paused", label: t("status_paused") },
          { key: "archived", label: t("status_archived") },
        ].map((f) => (
          <Link
            key={f.key}
            href={`/monetization?status=${f.key}`}
            className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
              activeFilter === f.key
                ? "border-violet-500 bg-violet-900/30 text-violet-300"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {productsWithHealth.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-10 border border-zinc-800 text-center">
          <p className="text-zinc-300 font-medium mb-2">{t("no_products")}</p>
          <p className="text-zinc-500 text-sm mb-6">{t("no_products_sub")}</p>
          <Link
            href="/monetization/new"
            className="px-5 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
          >
            {t("add_product_btn")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {productsWithHealth.map((product) => {
            const typeKey = `product_types.${product.type}` as string;
            const productTypeLabel =
              t(typeKey) !== typeKey
                ? t(typeKey)
                : product.type.replace("_", " ");
            const statusLabel =
              product.status === "active"
                ? t("status_active")
                : t("status_paused");
            return (
              <Link
                key={product.id}
                href={`/monetization/${product.id}`}
                className="block bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {product.health && (
                      <div
                        className={`w-3 h-3 rounded-full ${HEALTH_COLOR[product.health.color] ?? "bg-zinc-500"}`}
                      />
                    )}
                    <div>
                      <p className="font-semibold text-white">{product.name}</p>
                      <p className="text-xs text-zinc-500 capitalize mt-0.5">
                        {productTypeLabel}
                        {product.price_amount != null &&
                          ` · €${product.price_amount}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        product.status === "active"
                          ? "bg-emerald-900 text-emerald-300"
                          : "bg-zinc-700 text-zinc-400"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    {latestEventByProduct.has(product.id) && (
                      <p className="text-xs text-zinc-600 mt-1">
                        {t("last_event")} {latestEventByProduct.get(product.id)}
                      </p>
                    )}
                  </div>
                </div>
                {product.health && (
                  <div className="mt-3 flex gap-2">
                    {Object.entries(product.health.dimensions).map(
                      ([dim, score]) => (
                        <div key={dim} className="flex-1">
                          <p className="text-xs text-zinc-600 capitalize mb-1">
                            {dim}
                          </p>
                          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${HEALTH_COLOR[product.health!.color]}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
