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

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      {showTimeout && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 max-w-sm mx-4 text-center">
            <h2 className="text-xl font-semibold text-white mb-4">
              Session Timeout
            </h2>
            <p className="text-zinc-300 mb-6">
              For your security, this session has timed out. Please refresh to
              continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
        <p className="text-zinc-400">{t("subtitle")}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">
              {t("password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? t("loading") : t("submit")}
          </button>
        </form>
        <p className="text-center text-zinc-400 text-sm">
          New here?{" "}
          <Link
            href="/onboarding"
            className="text-violet-400 hover:text-violet-300"
          >
            Take your assessment →
          </Link>
        </p>
      </div>
    </div>
  );
}
