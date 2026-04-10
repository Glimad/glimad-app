"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!sessionId) router.replace("/onboarding");
  }, [sessionId, router]);

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
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute bottom-0 left-0 w-[500px] h-[400px]"
          style={{
            background:
              "radial-gradient(ellipse, rgba(0,180,140,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
            bottom: "-100px",
            left: "-100px",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[350px]"
          style={{
            background:
              "radial-gradient(ellipse, rgba(0,140,180,0.08) 0%, transparent 70%)",
            filter: "blur(60px)",
            bottom: "-80px",
            right: "-80px",
          }}
        />
      </div>

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
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 pt-24 relative z-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Icon */}
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
              style={{
                background: "linear-gradient(135deg, #00BFA5 0%, #7B61FF 100%)",
              }}
            >
              <span className="text-3xl" style={{ color: "white" }}>
                ✦
              </span>
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
            {/* Labels outside the card */}
            <div className="space-y-4 mb-2">
              <div>
                <label
                  className="block text-sm font-medium"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  {t("fullName")}
                </label>
              </div>
              <div>
                <label
                  className="block text-sm font-medium"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  {t("email")}
                </label>
              </div>
              <div>
                <label
                  className="block text-sm font-medium"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  {t("password")}
                </label>
              </div>
            </div>

            {/* Form card */}
            <div
              className="rounded-2xl overflow-hidden mb-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "16px",
                padding: "0",
              }}
            >
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 px-4 py-4"
                  style={{
                    borderTop:
                      index > 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
                    paddingTop: index > 0 ? "14px" : "16px",
                    paddingBottom: "14px",
                  }}
                >
                  <span
                    className="text-lg"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {index === 0 ? "👤" : index === 1 ? "✉" : "🔒"}
                  </span>
                  <input
                    type={
                      index === 2
                        ? showPassword
                          ? "text"
                          : "password"
                        : index === 1
                          ? "email"
                          : "text"
                    }
                    value={
                      index === 0 ? fullName : index === 1 ? email : password
                    }
                    onChange={(e) =>
                      index === 0
                        ? setFullName(e.target.value)
                        : index === 1
                          ? setEmail(e.target.value)
                          : setPassword(e.target.value)
                    }
                    placeholder={
                      index === 0
                        ? t("fullNamePlaceholder")
                        : index === 1
                          ? t("emailPlaceholder")
                          : t("passwordPlaceholder")
                    }
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                    style={{
                      caretColor: "#00C9A7",
                      color: "#fff",
                      fontSize: "14px",
                    }}
                    required={index > 0}
                    minLength={index === 2 ? 8 : undefined}
                  />
                  {index === 2 && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="flex-shrink-0"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                      {showPassword ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              ))}
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
              className="w-full font-semibold text-white text-sm transition-opacity disabled:opacity-35 disabled:cursor-not-allowed mb-4"
              style={{
                background: "linear-gradient(to right, #00BFA5, #26C6DA)",
                borderRadius: "10px",
                padding: "14px 28px",
                fontWeight: 600,
                fontSize: "15px",
              }}
            >
              {loading ? t("loading") : `${t("submit")} →`}
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
              <span className="text-base">G</span> {t("continueGoogle")}
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
              <span className="text-base">f</span> {t("continueFacebook")}
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
