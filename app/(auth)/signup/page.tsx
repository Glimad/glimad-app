"use client";

import { useState } from "react";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const t = useT("auth.signup");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sessionId = searchParams.get("sid");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
          onboarding_session_id: sessionId ?? null,
        },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/verify");
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex flex-col">
      {/* Background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
      </div>

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
          <span
            style={{
              fontFamily: "serif",
              fontSize: "28px",
              color: "white",
              fontWeight: 400,
              letterSpacing: "-0.5px",
            }}
          >
            g<sup style={{ fontSize: "14px", fontWeight: 400 }}>+</sup>
          </span>
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
          {/* Icon */}
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 via-emerald-400 to-pink-500 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center space-y-1">
            <h1
              className="font-bold text-white"
              style={{ fontSize: "28px", fontWeight: 700 }}
            >
              {t("title")}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "15px" }}>
              {t("subtitle")}
            </p>
          </div>

          {/* Form card */}
          <form onSubmit={handleSubmit}>
            <div
              className="rounded-2xl p-6 space-y-5 mb-4"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "16px",
              }}
            >
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />

                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-white/5 border border-white/10 text-white h-12 pl-11 rounded-lg focus:outline-none"
                    style={{ caretColor: "#00C9A7" }}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-white/5 border border-white/10 text-white h-12 pl-11 rounded-lg focus:outline-none"
                    style={{ caretColor: "#00C9A7" }}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Password
                </label>
                <div className="relative">
                  {/* Lock Icon */}
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />

                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full bg-white/5 border border-white/10 text-white h-12 pl-11 pr-10 rounded-lg focus:outline-none"
                    style={{ caretColor: "#00C9A7" }}
                    required
                    minLength={8}
                  />

                  {/* Eye toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm mb-4" style={{ color: "#FF6B6B" }}>
                {error}
              </p>
            )}

            {/* Primary CTA */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white h-12 rounded-lg font-semibold text-sm transition disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? t("loading") : t("submit")}

              {!loading && <ArrowRight className="h-5 w-5" />}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
            <span
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {t("orContinueWith")}
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
          </div>

          {/* Social buttons */}
          <div className="space-y-3">
            {/* Google */}
            <button
              type="button"
              onClick={() => {}}
              className="w-full py-3 text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "12px",
              }}
            >
              {/* Google Colored Icon */}
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.72 1.22 9.21 3.62l6.85-6.85C35.9 2.7 30.36 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.43 13.6 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.1 24.5c0-1.64-.15-3.21-.43-4.73H24v9h12.44c-.54 2.9-2.18 5.36-4.65 7.02l7.19 5.57C43.98 37.4 46.1 31.4 46.1 24.5z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.54 28.34A14.5 14.5 0 0 1 9.5 24c0-1.5.26-2.96.72-4.34l-7.98-6.2A24 24 0 0 0 0 24c0 3.77.88 7.34 2.56 10.56l7.98-6.22z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.15 15.9-5.86l-7.19-5.57c-2.01 1.35-4.59 2.16-8.71 2.16-6.26 0-11.57-4.1-13.46-9.84l-7.98 6.22C6.51 42.62 14.62 48 24 48z"
                />
              </svg>

              {t("continueGoogle")}
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => {}}
              className="w-full py-3 text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "12px",
              }}
            >
              {/* Facebook Icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M22 12.07C22 6.49 17.52 2 12 2S2 6.49 2 12.07C2 17.08 5.66 21.21 10.44 22v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.9h-2.34V22C18.34 21.21 22 17.08 22 12.07z" />
              </svg>

              {t("continueFacebook")}
            </button>

            {/* Twitter/X */}
            <button
              type="button"
              onClick={() => {}}
              className="w-full py-3 text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "12px",
              }}
            >
              <span className="text-base">𝕏</span> {t("continueTwitter")}
            </button>
          </div>
          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center">
        <p
          className="text-sm"
          style={{ color: "rgba(255,255,255,0.25)", fontSize: "12px" }}
        >
          {t("login_link")}{" "}
          <Link
            href="/login"
            className="font-medium transition-colors"
            style={{ color: "#26C6DA" }}
          >
            {t("login_cta")}
          </Link>
        </p>
      </footer>
    </div>
  );
}
