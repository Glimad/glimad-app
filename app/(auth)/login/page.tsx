"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  const t = useT("auth.login");
  const supabase = createClient();
  const searchParams = useSearchParams();
  const verificationFailed =
    searchParams?.get("error") === "verification_failed";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      window.location.href = "/subscribe";
      return;
    }

    const { data: subs } = await supabase
      .from("core_subscriptions")
      .select("status")
      .eq("project_id", project.id)
      .eq("status", "active")
      .limit(1);

    if (subs && subs.length > 0) {
      window.location.href = "/dashboard";
    } else {
      window.location.href = "/subscribe";
    }
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
      {/* Background gradients (Figma match) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
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
        className="relative z-10 border-b border-white/10 bg-black/50 backdrop-blur-sm"
        style={{
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          height: "64px",
          borderBottomColor: "rgba(255,255,255,0.08)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <Link href="/">
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <svg
                width="52"
                height="52"
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="52" height="52" rx="10" />
                <text
                  x="26"
                  y="40"
                  fontFamily="Georgia, 'Times New Roman', serif"
                  fontSize="38"
                  fontWeight="700"
                  fill="white"
                  textAnchor="middle"
                >
                  g
                </text>
                <path
                  d="M37,8 L38.4,4.2 L39.8,8 L43.6,9.4 L39.8,10.8 L38.4,14.6 L37,10.8 L33.2,9.4 Z"
                  fill="#2dd4bf"
                />
              </svg>
            </span>
          </Link>
          <button
            className="w-9 h-9 flex items-center justify-center transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px",
            }}
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
      <div className="flex-1 flex flex-col items-center px-4 pt-12 pb-8 relative z-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Icon (Figma style) */}
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 via-emerald-400 to-pink-500 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Sparkles className="h-8 w-8 text-white" />
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

          {verificationFailed && (
            <div
              className="rounded-xl px-4 py-3 text-sm text-center"
              style={{
                background: "rgba(255,180,60,0.08)",
                border: "1px solid rgba(255,180,60,0.3)",
                color: "rgba(255,220,180,0.9)",
              }}
            >
              {t("verificationFailed")}
            </div>
          )}

          {/* Tab Toggle (Figma match) */}
          <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl border border-white/10">
            {/* Magic Link */}
            <button
              onClick={() => {
                setActiveTab("magic");
                setError("");
              }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm transition-all ${
                activeTab === "magic"
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {t("magicLink")}
            </button>

            {/* Password */}
            <button
              onClick={() => {
                setActiveTab("password");
                setError("");
              }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm transition-all ${
                activeTab === "password"
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {t("passwordTab")}
            </button>
          </div>

          {/* Password tab */}
          {activeTab === "password" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email label */}
              {/* <label
                className="block text-sm font-medium"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {t("email")}
              </label> */}

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">
                    {t("magicLinkEmail")}
                  </label>

                  <div
                    className="flex items-center gap-3 h-12 px-4 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <svg
                      className="w-4 h-4"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M3 8l9 6 9-6M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
                        strokeWidth="1.5"
                      />
                    </svg>

                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("emailPlaceholder")}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">
                    {t("password")}
                  </label>

                  <div
                    className="relative flex items-center gap-3 h-12 px-4 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {/* Lock Icon */}
                    <svg
                      className="w-4 h-4"
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
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeWidth="1.5" />
                    </svg>

                    {/* Input */}
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("passwordPlaceholder")}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none pr-8"
                      required
                    />

                    {/* Eye Button */}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm" style={{ color: "#FF6B6B" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white h-12 rounded-lg font-semibold text-sm transition disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                // style={{
                //   background: "linear-gradient(to right, #00BFA5, #26C6DA)",
                //   borderRadius: "10px",
                //   padding: "14px 28px",
                //   fontWeight: 600,
                //   fontSize: "15px",
                // }}
              >
                {loading ? t("loading") : `${t("submit")} →`}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm transition-colors"
                  style={{ color: "#26C6DA", fontSize: "14px" }}
                >
                  {t("forgotPassword")}
                </button>
              </div>
            </form>
          )}

          {/* Magic Link tab */}
          {activeTab === "magic" && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              {/* OUTER CONTAINER */}
              <div
                className="rounded-xl px-4 py-4 space-y-4"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {/* EMAIL BOX (INNER CARD 1) */}
                <div
                  className="rounded-xl px-4 py-4"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <label className="block text-sm font-medium text-white/90 mb-2">
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

                {/* MAGIC LINK INFO BOX (INNER CARD 2) */}
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: "rgba(0,201,167,0.08)",
                    border: "1px solid rgba(0,201,167,0.2)",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {t("magicLinkInfo")}
                </div>
              </div>

              {/* STATUS TEXT */}
              {magicLinkSent && (
                <p className="text-sm text-center" style={{ color: "#00C9A7" }}>
                  ✓ {t("magicLinkSent")}
                </p>
              )}

              {error && (
                <p className="text-sm" style={{ color: "#FF6B6B" }}>
                  {error}
                </p>
              )}

              {/* BUTTON */}
              <button
                type="submit"
                disabled={magicLoading || magicLinkSent}
                className="w-full text-white text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(to right, #00BFA5, #26C6DA)",
                  borderRadius: "8px",
                  padding: "14px 28px",
                  fontWeight: 600,
                  fontSize: "15px",
                }}
              >
                {magicLoading ? t("magicLinkSending") : t("magicLinkSubmit")}
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
            <span
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {t("orDivider")}
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
          </div>

          {/* Sign-up link (web flow: signup → onboarding → subscribe) */}
          <p
            className="text-center text-sm"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            {t("signup_link")}{" "}
            <Link
              href="/signup"
              className="font-medium transition-colors"
              style={{ color: "#00C9A7" }}
            >
              {t("signup_cta")}
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      {/* <footer className="relative z-10 py-4 text-center">
        <p
          className="text-xs"
          style={{ color: "rgba(255,255,255,0.25)", fontSize: "12px" }}
        >
          © 2024 GLIMAD. Your digital acceleration partner.
        </p>
      </footer> */}
    </div>
  );
}
