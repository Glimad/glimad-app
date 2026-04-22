"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";

const ALLOWED_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "linkedin",
  "facebook",
  "spotify",
  "behance",
  "pinterest",
] as const;

type Platform = (typeof ALLOWED_PLATFORMS)[number];

interface WebsiteInference {
  niche: string | null;
  subniche: string | null;
  target_audience: string | null;
  unique_angle: string | null;
  suggested_platforms: string[];
  confidence: "high" | "medium" | "low";
}

interface WebsiteScrape {
  url: string;
  title: string | null;
  meta_description: string | null;
  og_description: string | null;
  social_handles?: { platform: string; url: string }[];
}

interface IdentityNiche {
  niche: string | null;
  subniche: string | null;
  target_audience: string | null;
  unique_angle: string | null;
}

interface PlatformFocus {
  platform: string;
  handle: string | null;
  follower_count: number;
}

interface Satellite {
  platform: string;
  handle: string;
}

interface BrainReadOutput {
  "website.url"?: string | null;
  "website.inference"?: WebsiteInference | null;
  "website.scrape"?: WebsiteScrape | null;
  "identity.niche"?: IdentityNiche | null;
  "platforms.all"?: { platform: string; handle: string | null }[] | null;
}

export function WebsiteFocoConfirmReview({
  brainRead,
  onSubmit,
  submitting,
}: {
  brainRead: BrainReadOutput;
  onSubmit: (payload: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const t = useT("missions");

  const inference = brainRead["website.inference"] ?? null;
  const scrape = brainRead["website.scrape"] ?? null;
  const websiteUrl = brainRead["website.url"] ?? scrape?.url ?? "";
  const existingNiche = brainRead["identity.niche"] ?? null;

  // Handles the scraper may have picked up from the site itself — nice starting
  // point for user handles on the suggested platforms.
  const handleHintByPlatform = useMemo(() => {
    const map: Record<string, string> = {};
    for (const h of scrape?.social_handles ?? []) {
      if (!map[h.platform]) map[h.platform] = h.url;
    }
    return map;
  }, [scrape?.social_handles]);

  const suggested = (inference?.suggested_platforms ?? []).filter(
    (p): p is Platform => (ALLOWED_PLATFORMS as readonly string[]).includes(p),
  );

  const [focusPlatform, setFocusPlatform] = useState<Platform>(
    (suggested[0] as Platform) ?? "instagram",
  );
  const [focusHandle, setFocusHandle] = useState<string>(
    handleHintByPlatform[suggested[0] ?? ""] ?? "",
  );

  const initialSatellites: Satellite[] = suggested.slice(1, 3).map((p) => ({
    platform: p,
    handle: handleHintByPlatform[p] ?? "",
  }));
  const [satellites, setSatellites] = useState<Satellite[]>(initialSatellites);

  const [niche, setNiche] = useState<string>(
    existingNiche?.niche ?? inference?.niche ?? "",
  );
  const [subniche, setSubniche] = useState<string>(
    existingNiche?.subniche ?? inference?.subniche ?? "",
  );
  const [audience, setAudience] = useState<string>(
    existingNiche?.target_audience ?? inference?.target_audience ?? "",
  );
  const [angle, setAngle] = useState<string>(
    existingNiche?.unique_angle ?? inference?.unique_angle ?? "",
  );

  function onFocusPlatformChange(next: Platform) {
    setFocusPlatform(next);
    const hint = handleHintByPlatform[next];
    if (hint && !focusHandle) setFocusHandle(hint);
  }

  function addSatellite() {
    const used = new Set<string>([focusPlatform, ...satellites.map((s) => s.platform)]);
    const next = ALLOWED_PLATFORMS.find((p) => !used.has(p));
    if (!next) return;
    setSatellites([...satellites, { platform: next, handle: handleHintByPlatform[next] ?? "" }]);
  }

  function removeSatellite(idx: number) {
    setSatellites(satellites.filter((_, i) => i !== idx));
  }

  function updateSatellite(idx: number, patch: Partial<Satellite>) {
    setSatellites(satellites.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function handleSubmit() {
    const focus: PlatformFocus = {
      platform: focusPlatform,
      handle: focusHandle.trim() || null,
      follower_count: 0,
    };

    const cleanedSatellites = satellites
      .filter((s) => s.handle.trim().length > 0 && s.platform !== focusPlatform)
      .map((s) => ({ platform: s.platform, handle: s.handle.trim() }));

    const identityNiche: IdentityNiche = {
      niche: niche.trim() || null,
      subniche: subniche.trim() || null,
      target_audience: audience.trim() || null,
      unique_angle: angle.trim() || null,
    };

    onSubmit({
      "platforms.focus": focus,
      "platforms.satellites": cleanedSatellites,
      "identity.niche": identityNiche,
    });
  }

  const canSubmit =
    !!focusPlatform && focusHandle.trim().length > 0 && niche.trim().length > 0;

  const confidenceLabel =
    inference?.confidence === "high"
      ? t("website_foco_confidence_high")
      : inference?.confidence === "medium"
        ? t("website_foco_confidence_medium")
        : inference?.confidence === "low"
          ? t("website_foco_confidence_low")
          : null;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="text-base font-semibold text-white mb-1">
          {t("website_foco_title")}
        </h2>
        <p className="text-zinc-400 text-sm">{t("website_foco_subtitle")}</p>
      </div>

      {/* Website analyzed (read-only) */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          {t("website_foco_website_section")}
        </h3>
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-violet-400 hover:text-violet-300 break-all"
        >
          {websiteUrl}
        </a>
        {scrape?.title && (
          <p className="text-sm text-zinc-200 mt-3 font-medium">{scrape.title}</p>
        )}
        {(scrape?.meta_description || scrape?.og_description) && (
          <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
            {scrape.meta_description ?? scrape.og_description}
          </p>
        )}
      </div>

      {/* Inferred summary (read-only) */}
      {inference ? (
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              {t("website_foco_analysis_section")}
            </h3>
            {confidenceLabel && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(124,58,237,0.15)",
                  color: "#c4b5fd",
                  border: "1px solid rgba(124,58,237,0.4)",
                }}
              >
                {confidenceLabel}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ReadOnlyPair label={t("website_foco_niche_label")} value={inference.niche} />
            <ReadOnlyPair label={t("website_foco_subniche_label")} value={inference.subniche} />
            <ReadOnlyPair label={t("website_foco_audience_label")} value={inference.target_audience} />
            <ReadOnlyPair label={t("website_foco_angle_label")} value={inference.unique_angle} />
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 text-sm text-zinc-500">
          {t("website_foco_no_inference")}
        </div>
      )}

      {/* Focus platform (editable) */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">
          {t("website_foco_focus_section")}
        </h3>
        <p className="text-xs text-zinc-500 mb-4">{t("website_foco_focus_subtitle")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldLabel text={t("website_foco_platform_label")}>
            <select
              value={focusPlatform}
              onChange={(e) => onFocusPlatformChange(e.target.value as Platform)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            >
              {ALLOWED_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {capitalize(p)}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel text={t("website_foco_handle_label")}>
            <input
              type="text"
              value={focusHandle}
              onChange={(e) => setFocusHandle(e.target.value)}
              placeholder="@handle or https://…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </FieldLabel>
        </div>
      </div>

      {/* Satellites (editable) */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">
          {t("website_foco_satellites_section")}
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          {t("website_foco_satellites_subtitle")}
        </p>
        <div className="space-y-3">
          {satellites.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <FieldLabel text={t("website_foco_platform_label")}>
                  <select
                    value={s.platform}
                    onChange={(e) => updateSatellite(i, { platform: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    {ALLOWED_PLATFORMS.map((p) => (
                      <option
                        key={p}
                        value={p}
                        disabled={
                          p === focusPlatform ||
                          satellites.some((other, j) => j !== i && other.platform === p)
                        }
                      >
                        {capitalize(p)}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
              </div>
              <div className="col-span-5">
                <FieldLabel text={t("website_foco_handle_label")}>
                  <input
                    type="text"
                    value={s.handle}
                    onChange={(e) => updateSatellite(i, { handle: e.target.value })}
                    placeholder="@handle or https://…"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </FieldLabel>
              </div>
              <div className="col-span-2">
                <button
                  onClick={() => removeSatellite(i)}
                  className="w-full py-2 text-xs text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-800 rounded-lg transition-colors"
                >
                  {t("website_foco_remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
        {satellites.length < ALLOWED_PLATFORMS.length - 1 && (
          <button
            onClick={addSatellite}
            className="mt-3 text-sm text-violet-400 hover:text-violet-300"
          >
            + {t("website_foco_add_satellite")}
          </button>
        )}
      </div>

      {/* Niche fields (editable) */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
          {t("website_foco_niche_section")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldLabel text={t("website_foco_niche_label")}>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              maxLength={200}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </FieldLabel>
          <FieldLabel text={t("website_foco_subniche_label")}>
            <input
              type="text"
              value={subniche}
              onChange={(e) => setSubniche(e.target.value)}
              maxLength={200}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </FieldLabel>
          <FieldLabel text={t("website_foco_audience_label")}>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              maxLength={200}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </FieldLabel>
          <FieldLabel text={t("website_foco_angle_label")}>
            <input
              type="text"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              maxLength={200}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </FieldLabel>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-40"
        style={{
          background: "linear-gradient(to right, #7C3AED, #9B6BFF)",
          fontSize: "15px",
        }}
      >
        {submitting ? t("saving") : t("website_foco_cta")}
      </button>
    </div>
  );
}

function FieldLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{text}</label>
      {children}
    </div>
  );
}

function ReadOnlyPair({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-200 mt-0.5">
        {value || <span className="text-zinc-600 italic">—</span>}
      </p>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
