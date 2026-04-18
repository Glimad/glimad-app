"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export default function CheckoutButton({ planCode }: { planCode: string }) {
  const t = useT("subscribe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");

    try {
      // Get the current session token so the API route can authenticate the user
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("You must be logged in to continue.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_code: planCode }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        console.error("Checkout error:", data);
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect to Stripe checkout
      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout exception:", err);
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
        style={{
          background: "linear-gradient(to right, #00C9A7, #48CAE4)",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? t("processing") : t("cta")}
      </button>
      {error && (
        <p
          style={{
            color: "#FF6B6B",
            fontSize: "13px",
            marginTop: "8px",
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
