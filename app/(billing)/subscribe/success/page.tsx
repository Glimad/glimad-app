"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export default function SubscribeSuccessPage() {
  const t = useT("subscribe");
  const [timedOut] = useState(false);
  const [dots, setDots] = useState(".");

  // Animate dots
  useEffect(() => {
    const iv = setInterval(
      () => setDots((d) => (d.length >= 3 ? "." : d + ".")),
      500,
    );
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let attempts = 0;

    async function poll() {
      attempts++;

      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch("/api/me/access", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();

        if (data.access_state === "active") {
          window.location.href = "/dashboard";
          return;
        }
      } catch {
        // network error — keep polling
      }

      if (attempts < 12) {
        // Poll every 3 seconds for up to 36 seconds
        setTimeout(poll, 3000);
      } else {
        // After 36 seconds redirect to dashboard anyway
        // The webhook may have already fired server-side even if polling missed it
        window.location.href = "/dashboard";
      }
    }

    // Start first poll after 2 seconds (give webhook time to fire)
    setTimeout(poll, 2000);
  }, []);

  if (timedOut) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg font-medium mb-2">
            {t("timeout_title")}
          </p>
          <p className="text-zinc-400 text-sm mb-6">{t("timeout_sub")}</p>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="px-6 py-2 bg-white text-black rounded-lg font-medium mr-3"
          >
            {t("go_dashboard")}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 border border-zinc-600 text-white rounded-lg font-medium"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg font-medium">
          {t("activating")}
          {dots}
        </p>
        <p className="text-zinc-400 text-sm mt-2">{t("activating_sub")}</p>
      </div>
    </div>
  );
}
