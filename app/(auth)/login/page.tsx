"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  const t = useT("auth.login");
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);
  const [activeTab, setActiveTab] = useState<"password" | "magic">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setShowTimeout(true);
      }, 60000); // 60 seconds
    };

    resetTimer();

    const events = ["mousemove", "keydown", "click"];
    const handleActivity = () => resetTimer();

    events.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", data.user.id)
      .neq("status", "archived")
      .single();

    if (!project) {
      router.push("/subscribe");
      router.refresh();
      return;
    }

    const { data: subs } = await supabase
      .from("core_subscriptions")
      .select("status")
      .eq("project_id", project.id)
      .eq("status", "active")
      .limit(1);

    if (subs && subs.length > 0) {
      router.push("/dashboard");
    } else {
      router.push("/subscribe");
    }
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMagicLoading(true);
    await supabase.auth.signInWithOtp({ email });
    setMagicLinkSent(true);
    setMagicLoading(false);
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex flex-col">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute bottom-0 left-0 w-[600px] h-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at bottom left, rgba(0,200,150,0.08) 0%, rgba(0,150,200,0.06) 40%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at bottom right, rgba(0,150,200,0.06) 0%, transparent 60%)",
          }}
        />
      </div>

      {/* Security timeout banner */}
      {showTimeout && (
        <div
          className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4"
          style={{ zIndex: 60 }}
        >
          <div
            className="max-w-lg w-full text-white text-sm px-4 py-3 rounded-lg text-center"
            style={{ background: "rgba(200,50,50,0.9)" }}
          >
            ⚠ {t("sessionTimeout")}{" "}
            <button
              onClick={() => window.location.reload()}
              className="underline font-semibold ml-1"
            >
              {t("refreshButton")}
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          height: "64px",
          borderBottomColor: "rgba(255,255,255,0.08)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-tight">
            g+
          </span>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.3)" }}
            aria-label="Language"
          >
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
              <path
                d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 pt-24 relative z-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Icon */}
          <div className="text-center">
            <div className="relative inline-block">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                style={{
                  background:
                    "linear-gradient(135deg, #00C9A7, #9B6BFF, #FF6B9D)",
                  padding: "2px",
                }}
              >
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                  <span className="text-3xl">✦</span>
                </div>
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="text-center space-y-1">
            <h1
              className="font-bold text-white"
              style={{ fontSize: "32px", fontWeight: 700 }}
            >
              {t("title")}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "15px" }}>
              {t("subtitle")}
            </p>
          </div>

          {/* Tab Toggle */}
          <div
            className="flex p-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <button
              onClick={() => {
                setActiveTab("magic");
                setError("");
              }}
              className="flex-1 py-2 rounded-full text-sm font-medium transition-all"
              style={
                activeTab === "magic"
                  ? {
                      background:
                        "linear-gradient(to right, #00C9A7, #48CAE4)",
                      color: "#fff",
                    }
                  : { color: "rgba(255,255,255,0.5)" }
              }
            >
              {t("magicLink")}
            </button>
            <button
              onClick={() => {
                setActiveTab("password");
                setError("");
              }}
              className="flex-1 py-2 rounded-full text-sm font-medium transition-all"
              style={
                activeTab === "password"
                  ? {
                      background:
                        "linear-gradient(to right, #00C9A7, #48CAE4)",
                      color: "#fff",
                    }
                  : { color: "rgba(255,255,255,0.5)" }
              }
            >
              {t("passwordTab")}
            </button>
          </div>

          {/* Password tab */}
          {activeTab === "password" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {/* Email field */}
                <div className="px-4 pt-4 pb-3">
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {t("email")}
                  </label>
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M3 8l9 6 9-6M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("emailPlaceholder")}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                      style={{
                        color: "#fff",
                        caretColor: "#00C9A7",
                      }}
                      required
                    />
                  </div>
                </div>

                <div
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                />

                {/* Password field */}
                <div className="px-4 pt-3 pb-4">
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {t("password")}
                  </label>
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect
                        x="3"
                        y="11"
                        width="18"
                        height="11"
                        rx="2"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M7 11V7a5 5 0 0 1 10 0v4"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("passwordPlaceholder")}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                      style={{
                        color: "#fff",
                        caretColor: "#00C9A7",
                      }}
                      required
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm" style={{ color: "#FF6B6B" }}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-opacity disabled:opacity-40"
                style={{
                  background: "linear-gradient(to right, #00C9A7, #48CAE4)",
                  borderRadius: "8px",
                  padding: "12px 28px",
                  fontWeight: 600,
                }}
              >
                {loading ? t("loading") : `${t("submit")} →`}
              </button>

              <div className="text-right">
                <button
                  type="button"
                  className="text-sm transition-colors"
                  style={{ color: "#00C9A7" }}
                >
                  {t("forgotPassword")}
                </button>
              </div>
            </form>
          )}

          {/* Magic Link tab */}
          {activeTab === "magic" && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div
                className="rounded-xl px-4 py-4"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <label
                  className="block text-sm font-medium mb-3"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {t("magicLinkEmail")}
                </label>
                <div className="flex items-center gap-3">
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 8l9 6 9-6M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                    style={{ caretColor: "#00C9A7" }}
                    required
                  />
                </div>
              </div>

              {/* Info box */}
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(0,201,167,0.08)",
                  border: "1px solid rgba(0,201,167,0.2)",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                💡 {t("magicLinkInfo")}
              </div>

              {magicLinkSent && (
                <p className="text-sm text-center" style={{ color: "#00C9A7" }}>
                  ✓ {t("magicLinkSent")}
                </p>
              )}

              {error && <p className="text-sm" style={{ color: "#FF6B6B" }}>{error}</p>}

              <button
                type="submit"
                disabled={magicLoading || magicLinkSent}
                className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-opacity disabled:opacity-40"
                style={{
                  background: "linear-gradient(to right, #00C9A7, #48CAE4)",
                  borderRadius: "8px",
                  fontWeight: 600,
                }}
              >
                {magicLoading ? t("magicLinkSending") : t("magicLinkSubmit")}
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("orDivider")}
            </span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
          </div>

          {/* Assessment link */}
          <p className="text-center text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            {t("signup_link")}{" "}
            <Link
              href="/onboarding"
              className="font-medium transition-colors"
              style={{ color: "#00C9A7" }}
            >
              {t("signup_cta")}
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center">
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          © 2024 GLIMAD. Your digital acceleration partner.
        </p>
      </footer>
    </div>
  );
}
