import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeServerT } from "@/lib/i18n.server";
import { defaultLocale } from "@/i18n.config";
import CheckoutButton from "./CheckoutButton";

type Plan = {
  plan_code: string;
  name: string;
  price_monthly_eur: number;
};

const PLAN_DISPLAY: Record<
  string,
  {
    label: string;
    tagline: string;
    badge?: string;
    badgeColor?: string;
    borderColor: string;
    accentColor: string;
  }
> = {
  starter: {
    label: "Starter",
    tagline: "Build Your Foundation",
    borderColor: "rgba(255,255,255,0.15)",
    accentColor: "#48CAE4",
  },
  growth: {
    label: "Growth",
    tagline: "Execute & Get Real Results",
    badge: "Most Popular",
    badgeColor: "#9B6BFF",
    borderColor: "#9B6BFF",
    accentColor: "#9B6BFF",
  },
  scale: {
    label: "Scale",
    tagline: "Monetize & Expand",
    borderColor: "rgba(255,255,255,0.15)",
    accentColor: "#FF6B9D",
  },
};

export default async function SubscribePage() {
  const cookieStore = cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value ?? defaultLocale;
  const messages = (await import(`@/messages/${locale}/subscribe.json`))
    .default as Record<string, unknown>;
  const t = makeServerT(messages);

  const admin = createAdminClient();

  const { data: plans } = await admin
    .from("core_plans")
    .select("plan_code, name, price_monthly_eur")
    .eq("active", true)
    .order("price_monthly_eur", { ascending: true });

  const planList: Plan[] = plans ?? [];

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute bottom-0 left-0"
          style={{
            width: "600px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at bottom left, rgba(0,200,150,0.07) 0%, transparent 65%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0"
          style={{
            width: "500px",
            height: "400px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at bottom right, rgba(0,150,200,0.06) 0%, transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-start min-h-screen px-4 py-16">
        {/* Hero section */}
        <div className="text-center mb-10">
          {/* Rocket icon */}
          <div
            className="inline-flex items-center justify-center mb-6 relative"
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #00C9A7, #9B6BFF, #FF6B9D)",
              padding: "2px",
            }}
          >
            <div
              className="w-full h-full rounded-full bg-black flex items-center justify-center"
              style={{ fontSize: "32px" }}
            >
              🚀
            </div>
            <div
              className="absolute -top-2 -right-2 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "linear-gradient(to right, #00C9A7, #48CAE4)",
                color: "#000",
                fontSize: "10px",
              }}
            >
              Ready
            </div>
          </div>

          <h1
            className="font-bold text-white mb-3"
            style={{ fontSize: "36px", fontWeight: 700 }}
          >
            Your Growth System is Ready 🚀
          </h1>
          <p
            className="mb-6"
            style={{ color: "rgba(255,255,255,0.6)", fontSize: "16px" }}
          >
            Start building, growing and monetizing — all in one place
          </p>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "#00C9A7" }}
            >
              <span>✓</span> 7-day money-back guarantee
            </span>
            <span
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              <span>⏱</span> Cancel anytime
            </span>
          </div>
        </div>

        {/* Currency selector (UI only) */}
        <div className="mb-8 flex items-center justify-center">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.8)",
              cursor: "default",
            }}
          >
            <span>🇪🇺</span>
            <span>EUR €</span>
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M19 9l-7 7-7-7"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mb-10">
          {planList.map((plan) => {
            const code = plan.plan_code as "starter" | "growth" | "scale";
            const features =
              (t.raw(`plans.${code}.features`) as string[] | undefined) ?? [];
            const description = t(`plans.${code}.description`);
            const display = PLAN_DISPLAY[code];

            return (
              <div
                key={code}
                className="flex flex-col relative"
                style={{
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${display?.borderColor ?? "rgba(255,255,255,0.15)"}`,
                  padding: "28px",
                }}
              >
                {/* Popular badge */}
                {display?.badge && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full text-white"
                    style={{
                      background: display.badgeColor ?? "#9B6BFF",
                      fontSize: "11px",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {display.badge}
                  </div>
                )}

                <div className="mb-6">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-1"
                    style={{ color: display?.accentColor ?? "#fff" }}
                  >
                    {display?.label ?? plan.name}
                  </p>
                  <p
                    className="text-sm mb-3"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {display?.tagline ?? description}
                  </p>
                  <div className="flex items-baseline gap-1 mt-4">
                    <span
                      className="font-bold text-white"
                      style={{ fontSize: "36px", fontWeight: 700 }}
                    >
                      €{plan.price_monthly_eur}
                    </span>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "14px",
                      }}
                    >
                      {t("per_month")}
                    </span>
                  </div>
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm"
                      style={{ color: "rgba(255,255,255,0.8)" }}
                    >
                      <span
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: display?.accentColor ?? "#00C9A7" }}
                      >
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <CheckoutButton planCode={code} />
              </div>
            );
          })}
        </div>

        {/* Note bar */}
        <div
          className="w-full max-w-5xl text-center py-4 px-6 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <p
            className="text-sm mb-1"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Most users upgrade after seeing their roadmap — start with what fits
            you now
          </p>
          <p className="text-xs font-medium" style={{ color: "#00C9A7" }}>
            ⚡ Beta pricing available for a limited time
          </p>
        </div>
      </div>
    </div>
  );
}
