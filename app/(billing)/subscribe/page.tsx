import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeServerT } from "@/lib/i18n.server";
import { defaultLocale } from "@/i18n.config";
import CheckoutButton from "./CheckoutButton";
import { Sparkles } from "lucide-react";

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
          <div className="relative inline-flex items-center justify-center mb-6">
            {/* Outer glow border */}
            <div className="relative w-[110px] h-[110px] rounded-xl p-[1.5px] bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 shadow-[0_0_18px_rgba(34,211,238,0.25),0_0_30px_rgba(168,85,247,0.35),0_0_45px_rgba(236,72,153,0.22)]">
              {/* Inner container */}
              <div className="relative w-full h-full rounded-xl overflow-hidden flex items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_75%_25%,rgba(168,85,247,0.25),transparent_40%),radial-gradient(circle_at_70%_80%,rgba(236,72,153,0.18),transparent_40%),linear-gradient(135deg,#0a0a14_0%,#151530_40%,#1a0f2a_70%,#140d1d_100%)]">
                {/* SVG */}
                <div className="relative w-full h-full flex items-center justify-center p-3">
                  <svg
                    viewBox="0 0 120 120"
                    className="w-full h-full"
                    fill="none"
                  >
                    <defs>
                      <linearGradient
                        id="pathGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        <stop
                          offset="0%"
                          stopColor="#06b6d4"
                          stopOpacity="0.8"
                        />
                        <stop
                          offset="50%"
                          stopColor="#8b5cf6"
                          stopOpacity="0.9"
                        />
                        <stop
                          offset="100%"
                          stopColor="#ec4899"
                          stopOpacity="0.8"
                        />
                      </linearGradient>

                      <radialGradient id="starGradient">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </radialGradient>

                      <radialGradient id="dotGlow1">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop
                          offset="100%"
                          stopColor="#06b6d4"
                          stopOpacity="0"
                        />
                      </radialGradient>

                      <radialGradient id="dotGlow2">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop
                          offset="100%"
                          stopColor="#8b5cf6"
                          stopOpacity="0"
                        />
                      </radialGradient>

                      <radialGradient id="dotGlow3">
                        <stop offset="0%" stopColor="#ec4899" />
                        <stop
                          offset="100%"
                          stopColor="#ec4899"
                          stopOpacity="0"
                        />
                      </radialGradient>
                    </defs>

                    {/* subtle dashed lines */}
                    <path
                      d="M 15 90 L 40 65"
                      stroke="rgba(139,92,246,0.2)"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <path
                      d="M 40 65 L 70 55"
                      stroke="rgba(139,92,246,0.2)"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <path
                      d="M 70 55 L 95 30"
                      stroke="rgba(139,92,246,0.2)"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />

                    {/* main path */}
                    <path
                      d="M 15 90 Q 25 75, 40 65 T 70 55 Q 82 45, 95 30"
                      stroke="url(#pathGradient)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                      className="animate-pulse"
                      style={{
                        filter: "drop-shadow(0 0 8px rgba(139,92,246,0.6))",
                      }}
                    />

                    {/* glow circles */}
                    <circle
                      cx="15"
                      cy="90"
                      r="10"
                      fill="url(#dotGlow1)"
                      opacity="0.4"
                      className="animate-pulse"
                    />
                    <circle
                      cx="40"
                      cy="65"
                      r="10"
                      fill="url(#dotGlow2)"
                      opacity="0.4"
                      className="animate-pulse"
                    />
                    <circle
                      cx="70"
                      cy="55"
                      r="10"
                      fill="url(#dotGlow3)"
                      opacity="0.4"
                      className="animate-pulse"
                    />

                    {/* nodes */}
                    <circle cx="15" cy="90" r="5" fill="#06b6d4" />
                    <circle cx="15" cy="90" r="3" fill="#fff" opacity="0.8" />

                    <circle cx="40" cy="65" r="5" fill="#8b5cf6" />
                    <circle cx="40" cy="65" r="3" fill="#fff" opacity="0.8" />

                    <circle cx="70" cy="55" r="5" fill="#ec4899" />
                    <circle cx="70" cy="55" r="3" fill="#fff" opacity="0.8" />

                    {/* star glow */}
                    <circle
                      cx="95"
                      cy="30"
                      r="12"
                      fill="url(#starGradient)"
                      opacity="0.3"
                      className="animate-pulse"
                    />

                    {/* star */}
                    <path
                      d="M 95 20 L 97.5 27.5 L 105 27.5 L 99 32 L 101.5 40 L 95 35.5 L 88.5 40 L 91 32 L 85 27.5 L 92.5 27.5 Z"
                      fill="url(#starGradient)"
                      style={{
                        filter: "drop-shadow(0 0 6px rgba(251,191,36,0.8))",
                      }}
                    />

                    {/* orbit particles */}
                    <circle
                      cx="102"
                      cy="23"
                      r="1.5"
                      fill="#fbbf24"
                      className="animate-ping"
                    />
                    <circle
                      cx="88"
                      cy="37"
                      r="1.5"
                      fill="#fbbf24"
                      className="animate-ping"
                    />
                    <circle
                      cx="103"
                      cy="35"
                      r="1.5"
                      fill="#fbbf24"
                      className="animate-ping"
                    />
                  </svg>
                </div>

                {/* shine overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent animate-pulse"></div>
              </div>
            </div>

            {/* floating sparkle */}
            <div className="absolute -top-3 -right-3 w-7 h-7 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-purple-500/50">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>

            {/* READY badge */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 rounded-full border border-white/20 shadow-lg">
              <span className="text-white text-xs font-medium">Ready</span>
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
