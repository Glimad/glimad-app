"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

type JourneyStage = "starting" | "existing" | "legacy" | "";
type StepName =
  | "welcome"
  | "project"
  | "journeyStage"
  | "yourIdea"
  | "goals"
  | "blockers"
  | "platforms"
  | "monetization"
  | "accompaniment"
  | "name"
  | "password"
  | "email"
  | "verify";

interface FormData {
  projectType: string;
  projectName: string;
  journeyStage: JourneyStage;
  projectIdea: string;
  projectNiche: string;
  useAIHelp: boolean;
  goals: string[];
  customGoal: string;
  blockers: string[];
  customBlocker: string;
  selectedPlatforms: string[];
  platformUrls: Record<string, string>;
  noPresence: boolean;
  monetization: string;
  monetizationDetails: string;
  accompaniment: string[];
  customHelp: string;
  name: string;
  password: string;
  email: string;
  gdprConsent: boolean;
}

function getTotalSteps(journeyStage: JourneyStage): number {
  if (!journeyStage) return 12;
  if (journeyStage === "starting") return 10;
  return 10; // existing or legacy
}

function getStepName(step: number, journeyStage: JourneyStage): StepName {
  if (step === 0) return "welcome";
  if (step === 1) return "project";
  if (step === 2) return "journeyStage";
  if (journeyStage === "starting") {
    const flow: StepName[] = [
      "yourIdea",
      "goals",
      "blockers",
      "platforms",
      "accompaniment",
      "name",
      "password",
      "email",
      "verify",
    ];
    return flow[step - 3] ?? "verify";
  }
  const flow: StepName[] = [
    "goals",
    "blockers",
    "platforms",
    "monetization",
    "accompaniment",
    "name",
    "password",
    "email",
    "verify",
  ];
  return flow[step - 3] ?? "verify";
}

const PROJECT_TYPES = [
  { id: "music", icon: "🎵", gradient: "from-purple-500 to-pink-500" },
  { id: "visual", icon: "🎨", gradient: "from-orange-500 to-pink-500" },
  { id: "creator", icon: "🎬", gradient: "from-blue-500 to-cyan-500" },
  {
    id: "personal-brand",
    icon: "💼",
    gradient: "from-emerald-500 to-cyan-500",
  },
];

const PLATFORM_LIST = [
  { id: "instagram" },
  { id: "tiktok" },
  { id: "youtube" },
  { id: "twitter" },
  { id: "linkedin" },
  { id: "facebook" },
  { id: "spotify" },
  { id: "behance" },
  { id: "pinterest" },
  { id: "website" },
  { id: "other" },
];

const CHIP_COLORS = [
  {
    border: "border-emerald-400",
    bg: "bg-emerald-400/20",
    text: "text-emerald-400",
    hover: "hover:border-emerald-400/50",
  },
  {
    border: "border-cyan-400",
    bg: "bg-cyan-400/20",
    text: "text-cyan-400",
    hover: "hover:border-cyan-400/50",
  },
  {
    border: "border-purple-400",
    bg: "bg-purple-400/20",
    text: "text-purple-400",
    hover: "hover:border-purple-400/50",
  },
  {
    border: "border-pink-400",
    bg: "bg-pink-400/20",
    text: "text-pink-400",
    hover: "hover:border-pink-400/50",
  },
  {
    border: "border-orange-400",
    bg: "bg-orange-400/20",
    text: "text-orange-400",
    hover: "hover:border-orange-400/50",
  },
];

const BLOCKER_COLORS = [
  {
    border: "border-orange-400",
    bg: "bg-orange-400/20",
    text: "text-orange-400",
    hover: "hover:border-orange-400/50",
  },
  {
    border: "border-red-400",
    bg: "bg-red-400/20",
    text: "text-red-400",
    hover: "hover:border-red-400/50",
  },
  {
    border: "border-pink-400",
    bg: "bg-pink-400/20",
    text: "text-pink-400",
    hover: "hover:border-pink-400/50",
  },
  {
    border: "border-rose-400",
    bg: "bg-rose-400/20",
    text: "text-rose-400",
    hover: "hover:border-rose-400/50",
  },
  {
    border: "border-amber-400",
    bg: "bg-amber-400/20",
    text: "text-amber-400",
    hover: "hover:border-amber-400/50",
  },
];

export default function OnboardingPage() {
  const t = useT("onboarding");
  const router = useRouter();
  const supabase = createClient();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [resending, setResending] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    projectType: "",
    projectName: "",
    journeyStage: "",
    projectIdea: "",
    projectNiche: "",
    useAIHelp: false,
    goals: [],
    customGoal: "",
    blockers: [],
    customBlocker: "",
    selectedPlatforms: [],
    platformUrls: {},
    noPresence: false,
    monetization: "",
    monetizationDetails: "",
    accompaniment: [],
    customHelp: "",
    name: "",
    password: "",
    email: "",
    gdprConsent: false,
  });

  const stepName = getStepName(step, formData.journeyStage);
  const totalSteps = getTotalSteps(formData.journeyStage);
  const progress = Math.round(((step + 1) / totalSteps) * 100);

  useEffect(() => {
    const visitorId =
      localStorage.getItem("glimad_visitor_id") ?? crypto.randomUUID();
    localStorage.setItem("glimad_visitor_id", visitorId);

    const existingSid = document.cookie
      .split("; ")
      .find((r) => r.startsWith("glimad_onboarding_sid="))
      ?.split("=")[1];
    if (existingSid) {
      setSessionId(existingSid);
      return;
    }

    fetch("/api/onboarding/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: visitorId }),
    })
      .then((r) => r.json())
      .then((data) => {
        const sid = data.onboarding_session_id;
        setSessionId(sid);
        document.cookie = `glimad_onboarding_sid=${sid}; path=/; max-age=86400; SameSite=Lax`;
      });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  async function patchStep(responses: Record<string, unknown>) {
    if (!sessionId) return;
    await fetch(`/api/onboarding/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, responses }),
    });
  }

  function getStepResponses(): Record<string, unknown> {
    switch (stepName) {
      case "project":
        return {
          project_type: formData.projectType,
          project_name: formData.projectName,
        };
      case "journeyStage":
        return { journey_stage: formData.journeyStage };
      case "yourIdea":
        return {
          vision: formData.useAIHelp
            ? formData.projectNiche
            : formData.projectIdea,
          use_ai_help: formData.useAIHelp,
        };
      case "goals":
        return { goals: formData.goals };
      case "blockers":
        return { blockers: formData.blockers };
      case "platforms":
        return {
          selected_platforms: formData.selectedPlatforms,
          platform_urls: formData.platformUrls,
          no_presence: formData.noPresence,
        };
      case "monetization":
        return {
          revenue_status: formData.monetization,
          monetization_details: formData.monetizationDetails,
        };
      case "accompaniment":
        return { support_needs: formData.accompaniment };
      case "name":
        return { full_name: formData.name };
      case "email":
        return { email: formData.email, gdpr_consent: formData.gdprConsent };
      default:
        return {};
    }
  }

  function canProceed(): boolean {
    switch (stepName) {
      case "welcome":
        return true;
      case "project":
        return !!(formData.projectType && formData.projectName.trim());
      case "journeyStage":
        return !!formData.journeyStage;
      case "yourIdea":
        return formData.useAIHelp
          ? formData.projectNiche.trim().length > 3
          : formData.projectIdea.trim().length > 15;
      case "goals":
        return formData.goals.length > 0;
      case "blockers":
        return formData.blockers.length > 0;
      case "platforms":
        if (formData.noPresence) return true;
        if (formData.journeyStage === "starting") {
          return (
            formData.selectedPlatforms.length > 0 &&
            formData.selectedPlatforms.some((p) =>
              formData.platformUrls[p]?.trim(),
            )
          );
        }
        return (
          formData.selectedPlatforms.length > 0 &&
          formData.selectedPlatforms.some((p) =>
            formData.platformUrls[p]?.trim(),
          )
        );
      case "monetization":
        return !!formData.monetization;
      case "accompaniment":
        return formData.accompaniment.length > 0;
      case "name":
        return formData.name.trim().length > 0;
      case "password":
        return formData.password.length >= 8;
      case "email":
        return formData.email.includes("@") && formData.gdprConsent;
      case "verify":
        return false;
      default:
        return true;
    }
  }

  async function handleNext() {
    if (!canProceed() || loading) return;
    setLoading(true);
    setSignupError("");

    if (stepName !== "welcome" && stepName !== "verify") {
      const responses = getStepResponses();
      if (Object.keys(responses).length > 0) {
        await patchStep(responses);
      }
    }

    if (stepName === "email") {
      const meta = {
        locale: navigator.language.slice(0, 2),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      await fetch(`/api/onboarding/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_responses: meta }),
      });

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: formData.name,
            onboarding_session_id: sessionId,
          },
        },
      });

      if (error) {
        setSignupError(error.message);
        setLoading(false);
        return;
      }

      // Explicitly link user to onboarding session (do not rely on DB triggers)
      if (signUpData?.user?.id) {
        await fetch(`/api/onboarding/${sessionId}/link-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: signUpData.user.id }),
        });
      }

      // Clear cookie after link-user so ownership check passes
      document.cookie = "glimad_onboarding_sid=; path=/; max-age=0";
    }

    setStep((s) => s + 1);
    setLoading(false);
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
      setSignupError("");
    }
  }

  function togglePlatform(platformId: string) {
    if (platformId === "none") {
      setFormData((prev) => ({
        ...prev,
        noPresence: !prev.noPresence,
        selectedPlatforms: [],
        platformUrls: {},
      }));
      return;
    }
    if (formData.noPresence)
      setFormData((prev) => ({ ...prev, noPresence: false }));
    const isSelected = formData.selectedPlatforms.includes(platformId);
    if (isSelected) {
      const newUrls = { ...formData.platformUrls };
      delete newUrls[platformId];
      setFormData((prev) => ({
        ...prev,
        selectedPlatforms: prev.selectedPlatforms.filter(
          (p) => p !== platformId,
        ),
        platformUrls: newUrls,
      }));
    } else if (formData.selectedPlatforms.length < 3) {
      setFormData((prev) => ({
        ...prev,
        selectedPlatforms: [...prev.selectedPlatforms, platformId],
      }));
    }
  }

  function toggleChip(list: string[], item: string, key: keyof FormData) {
    const next = list.includes(item)
      ? list.filter((i) => i !== item)
      : [...list, item];
    setFormData((prev) => ({ ...prev, [key]: next }));
  }

  function addCustomChip(
    value: string,
    list: string[],
    listKey: keyof FormData,
    inputKey: keyof FormData,
  ) {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setFormData((prev) => ({
      ...prev,
      [listKey]: [...(prev[listKey] as string[]), trimmed],
      [inputKey]: "",
    }));
  }

  async function handleResend() {
    if (resending || !formData.email) return;
    setResending(true);
    await supabase.auth.resend({ type: "signup", email: formData.email });
    setTimeout(() => setResending(false), 3000);
  }

  function renderStep() {
    switch (stepName) {
      // ── WELCOME ──────────────────────────────────────────────────────────
      case "welcome":
        return (
          <div className="text-center max-w-2xl mx-auto space-y-8">
            <div className="relative inline-block">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 via-emerald-400 to-pink-500 flex items-center justify-center mx-auto shadow-2xl shadow-cyan-500/40">
                <span className="text-4xl">✨</span>
              </div>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl font-bold text-white">
                {t("assessment.welcome.title")}
              </h1>
              <h2 className="text-xl sm:text-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-pink-400 bg-clip-text text-transparent font-semibold">
                {t("assessment.welcome.subtitle")}
              </h2>
              <p className="text-white/70 text-lg">
                {t("assessment.welcome.tagline")}
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleNext}
                className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold px-12 py-4 rounded-2xl text-lg shadow-xl shadow-cyan-500/30 transition-all duration-300 hover:scale-[1.02]"
              >
                {t("assessment.welcome.cta")} ›
              </button>
              <p className="text-white/40 text-sm">
                {t("assessment.welcome.duration")}
              </p>
            </div>
          </div>
        );

      // ── PROJECT ──────────────────────────────────────────────────────────
      case "project":
        return (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {t("assessment.project.question")}
            </h2>
            <p className="text-white/60 text-sm text-center mb-6">
              {t("assessment.project.subtitle")}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {PROJECT_TYPES.map((type) => {
                const isSelected = formData.projectType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, projectType: type.id }))
                    }
                    className={`relative p-4 rounded-2xl border-2 transition-all text-left ${
                      isSelected
                        ? "border-cyan-400 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20"
                        : "border-white/10 bg-white/5 hover:border-white/30"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${type.gradient} flex items-center justify-center mb-3 text-xl`}
                    >
                      {type.icon}
                    </div>
                    <span className="text-white text-sm font-medium">
                      {t(
                        `assessment.projectTypes.${type.id === "personal-brand" ? "personalBrand" : type.id}`,
                      )}
                    </span>
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center">
                        <span className="text-black text-xs">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="text-white text-sm font-medium mb-2 block">
                {t("assessment.project.nameLabel")}
              </label>
              <input
                type="text"
                value={formData.projectName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    projectName: e.target.value,
                  }))
                }
                placeholder={t("assessment.project.namePlaceholder")}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        );

      // ── JOURNEY STAGE ────────────────────────────────────────────────────
      case "journeyStage":
        return (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {t("assessment.journeyStage.title")}
            </h2>
            <p className="text-white/60 text-sm text-center mb-6">
              {t("assessment.journeyStage.subtitle")}
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              {(["starting", "existing", "legacy"] as const).map(
                (stage, idx) => {
                  const colors = [
                    {
                      border: "border-orange-400",
                      bg: "from-orange-500/20 via-pink-500/10 to-purple-500/20",
                      shadow: "shadow-orange-500/20",
                      icon: "🚀",
                      check: "bg-orange-400",
                    },
                    {
                      border: "border-cyan-400",
                      bg: "from-cyan-500/20 via-emerald-500/10 to-blue-500/20",
                      shadow: "shadow-cyan-500/20",
                      icon: "📈",
                      check: "bg-cyan-400",
                    },
                    {
                      border: "border-purple-400",
                      bg: "from-purple-500/20 via-pink-500/10 to-yellow-500/20",
                      shadow: "shadow-purple-500/20",
                      icon: "👑",
                      check: "bg-purple-400",
                    },
                  ];
                  const c = colors[idx];
                  const isSelected = formData.journeyStage === stage;
                  return (
                    <button
                      key={stage}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          journeyStage: stage,
                        }))
                      }
                      className={`relative p-5 rounded-3xl border-2 transition-all text-left ${
                        isSelected
                          ? `${c.border} bg-gradient-to-br ${c.bg} shadow-lg ${c.shadow}`
                          : "border-white/10 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <div className="text-3xl mb-3">{c.icon}</div>
                      <h3 className="text-white font-semibold mb-2">
                        {t(`assessment.journeyStage.${stage}.title`)}
                      </h3>
                      <p className="text-white/70 text-sm leading-relaxed">
                        {t(`assessment.journeyStage.${stage}.description`)}
                      </p>
                      {isSelected && (
                        <div
                          className={`absolute top-4 right-4 w-6 h-6 rounded-full ${c.check} flex items-center justify-center`}
                        >
                          <span className="text-black text-xs">✓</span>
                        </div>
                      )}
                    </button>
                  );
                },
              )}
            </div>
            <div className="mt-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-4 border border-purple-500/20">
              <p className="text-white/80 text-sm text-center">
                💡 {t("assessment.journeyStage.helpNote")}
              </p>
            </div>
          </div>
        );

      // ── YOUR IDEA (starting only) ─────────────────────────────────────────
      case "yourIdea":
        return (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {t("assessment.yourIdea.title")}
            </h2>
            <p className="text-white/60 text-sm text-center mb-6">
              {t("assessment.yourIdea.subtitle")}
            </p>

            {!formData.useAIHelp ? (
              <>
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-2 border-purple-500/30 rounded-2xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">💡</span>
                    <span className="text-white text-sm font-medium">
                      {t("assessment.yourIdea.describeLabel")}
                    </span>
                  </div>
                  <textarea
                    value={formData.projectIdea}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        projectIdea: e.target.value,
                      }))
                    }
                    placeholder={t("assessment.yourIdea.placeholder")}
                    rows={5}
                    className="w-full bg-black/40 border border-purple-500/30 text-white placeholder-white/40 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400 resize-none text-sm"
                  />
                  {formData.projectIdea.length >= 15 && (
                    <p className="text-emerald-400 text-xs mt-2">
                      {formData.projectIdea.length < 50
                        ? t("assessment.yourIdea.feedbackShort")
                        : formData.projectIdea.length < 100
                          ? t("assessment.yourIdea.feedbackMedium")
                          : t("assessment.yourIdea.feedbackGood")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      useAIHelp: true,
                      projectIdea: "",
                    }))
                  }
                  className="w-full text-center text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
                >
                  {t("assessment.yourIdea.switchToAIHelp")}
                </button>
              </>
            ) : (
              <>
                <div className="bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border-2 border-cyan-500/30 rounded-2xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {t("assessment.yourIdea.aiHelpTitle")}
                      </p>
                      <p className="text-white/60 text-xs">
                        {t("assessment.yourIdea.aiHelpDescription")}
                      </p>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={formData.projectNiche}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        projectNiche: e.target.value,
                      }))
                    }
                    placeholder={t("assessment.yourIdea.nichePlaceholder")}
                    className="w-full bg-black/40 border border-cyan-500/30 text-white placeholder-white/40 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-400 text-sm"
                  />
                  {formData.projectNiche.trim().length > 3 && (
                    <p className="text-cyan-400 text-xs mt-2">
                      {t("assessment.yourIdea.aiHelpSuccess")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      useAIHelp: false,
                      projectNiche: "",
                    }))
                  }
                  className="w-full text-center text-purple-400 text-sm hover:text-purple-300 transition-colors"
                >
                  {t("assessment.yourIdea.switchToOwnIdea")}
                </button>
              </>
            )}
          </div>
        );

      // ── GOALS ────────────────────────────────────────────────────────────
      case "goals": {
        const goalKeys =
          formData.journeyStage === "legacy"
            ? [
                "scaleRevenue",
                "buildSystems",
                "expandMarkets",
                "multipleStreams",
                "licenseIP",
                "buildTeam",
              ]
            : [
                "growCommunity",
                "professionalize",
                "collaborations",
                "monetize",
                "automate",
                "startIdea",
              ];
        const goalPrefix =
          formData.journeyStage === "legacy"
            ? "assessment.legacyGoals"
            : "assessment.goals";
        const goalLabels = goalKeys.map((k) => t(`${goalPrefix}.${k}`));

        return (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {t("assessment.goalsBlockers.title")}
            </h2>
            <p className="text-white/60 text-sm text-center mb-5">
              {t("assessment.goalsBlockers.subtitle")}
            </p>
            <div className="bg-gradient-to-br from-emerald-500/5 via-cyan-500/5 to-purple-500/5 border-2 border-emerald-500/20 rounded-2xl p-4">
              <p className="text-white/50 text-sm mb-4 text-center">
                {t("assessment.goalsBlockers.goalsHint")}
              </p>
              <div className="flex flex-wrap gap-3">
                {goalLabels.map((label, i) => {
                  const isSelected = formData.goals.includes(label);
                  const c = CHIP_COLORS[i % CHIP_COLORS.length];
                  return (
                    <button
                      key={label}
                      onClick={() => toggleChip(formData.goals, label, "goals")}
                      className={`py-2.5 px-5 rounded-full border-2 transition-all text-sm font-medium ${
                        isSelected
                          ? `${c.border} ${c.bg} ${c.text}`
                          : `border-white/10 bg-white/5 text-white/70 ${c.hover}`
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 pt-5 border-t border-white/10">
                <label className="text-white/80 text-sm mb-2 block">
                  ✨ {t("assessment.goalsBlockers.customGoalLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.customGoal}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        customGoal: e.target.value,
                      }))
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      addCustomChip(
                        formData.customGoal,
                        formData.goals,
                        "goals",
                        "customGoal",
                      )
                    }
                    className="flex-1 bg-black/40 border border-cyan-500/30 text-white placeholder-white/30 rounded-xl px-4 py-2.5 focus:outline-none focus:border-cyan-400 text-sm"
                  />
                  <button
                    onClick={() =>
                      addCustomChip(
                        formData.customGoal,
                        formData.goals,
                        "goals",
                        "customGoal",
                      )
                    }
                    disabled={!formData.customGoal.trim()}
                    className="bg-gradient-to-r from-cyan-500 to-emerald-500 disabled:opacity-30 text-white px-4 rounded-xl text-sm font-medium"
                  >
                    {t("assessment.goalsBlockers.addButton")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // ── BLOCKERS ─────────────────────────────────────────────────────────
      case "blockers": {
        const blockerKeys =
          formData.journeyStage === "legacy"
            ? [
                "scalingQuality",
                "teamBuilding",
                "operations",
                "creativeControl",
                "timeSplit",
                "systemsIntegration",
                "marketSaturation",
                "sustainingInnovation",
              ]
            : [
                "lackTime",
                "dontKnow",
                "noBudget",
                "dontUnderstandAlgorithms",
                "inconsistentPosting",
                "noStrategy",
                "lowEngagement",
                "technicalChallenges",
              ];
        const blockerPrefix =
          formData.journeyStage === "legacy"
            ? "assessment.legacyBlockers"
            : "assessment.blockers";
        const blockerLabels = blockerKeys.map((k) =>
          t(`${blockerPrefix}.${k}`),
        );
        const blockerTitle =
          formData.journeyStage === "legacy"
            ? t("assessment.goalsBlockers.blockerLabelLegacy")
            : t("assessment.goalsBlockers.blockerLabel");

        return (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {blockerTitle}
            </h2>
            <p className="text-white/60 text-sm text-center mb-5">
              {t("assessment.goalsBlockers.goalsHint")}
            </p>
            <div className="bg-gradient-to-br from-orange-500/5 via-red-500/5 to-pink-500/5 border-2 border-orange-500/20 rounded-2xl p-4">
              <div className="flex flex-wrap gap-3">
                {blockerLabels.map((label, i) => {
                  const isSelected = formData.blockers.includes(label);
                  const c = BLOCKER_COLORS[i % BLOCKER_COLORS.length];
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        toggleChip(formData.blockers, label, "blockers")
                      }
                      className={`py-2.5 px-5 rounded-full border-2 transition-all text-sm font-medium ${
                        isSelected
                          ? `${c.border} ${c.bg} ${c.text}`
                          : `border-white/10 bg-white/5 text-white/70 ${c.hover}`
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 pt-5 border-t border-white/10">
                <label className="text-white/80 text-sm mb-2 block">
                  ✨ {t("assessment.goalsBlockers.customBlockerLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.customBlocker}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        customBlocker: e.target.value,
                      }))
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      addCustomChip(
                        formData.customBlocker,
                        formData.blockers,
                        "blockers",
                        "customBlocker",
                      )
                    }
                    className="flex-1 bg-black/40 border border-orange-500/30 text-white placeholder-white/30 rounded-xl px-4 py-2.5 focus:outline-none focus:border-orange-400 text-sm"
                  />
                  <button
                    onClick={() =>
                      addCustomChip(
                        formData.customBlocker,
                        formData.blockers,
                        "blockers",
                        "customBlocker",
                      )
                    }
                    disabled={!formData.customBlocker.trim()}
                    className="bg-gradient-to-r from-orange-500 to-red-500 disabled:opacity-30 text-white px-4 rounded-xl text-sm font-medium"
                  >
                    {t("assessment.goalsBlockers.addButton")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // ── PLATFORMS ────────────────────────────────────────────────────────
      case "platforms": {
        const isStarting = formData.journeyStage === "starting";
        return (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {isStarting
                ? t("assessment.digitalPresence.titleStarting")
                : t("assessment.digitalPresence.titleExisting")}
            </h2>
            <p className="text-white/60 text-sm text-center mb-5">
              {isStarting
                ? t("assessment.digitalPresence.subtitleStarting")
                : t("assessment.digitalPresence.subtitleExisting")}
            </p>

            {formData.selectedPlatforms.length >= 3 && !formData.noPresence && (
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 mb-4 text-center">
                <p className="text-cyan-400 text-xs">
                  {t("assessment.digitalPresence.maxPlatformsNote")}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {PLATFORM_LIST.map((platform) => {
                const isSelected = formData.selectedPlatforms.includes(
                  platform.id,
                );
                const isDisabled =
                  !isSelected &&
                  formData.selectedPlatforms.length >= 3 &&
                  !formData.noPresence;
                return (
                  <div key={platform.id}>
                    <button
                      onClick={() => togglePlatform(platform.id)}
                      disabled={isDisabled}
                      className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? "border-cyan-400 bg-cyan-400/10"
                          : isDisabled
                            ? "border-white/5 bg-white/5 opacity-40 cursor-not-allowed"
                            : "border-white/10 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm">
                          {t(`assessment.platforms.${platform.id}`)}
                        </span>
                        {isSelected && (
                          <span className="text-cyan-400 ml-auto text-xs">
                            ✓
                          </span>
                        )}
                      </div>
                    </button>
                    {isSelected && (
                      <input
                        type="text"
                        value={formData.platformUrls[platform.id] ?? ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            platformUrls: {
                              ...prev.platformUrls,
                              [platform.id]: e.target.value,
                            },
                          }))
                        }
                        placeholder={t(
                          `assessment.placeholders.${platform.id}`,
                        )}
                        className="mt-2 w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {isStarting && (
              <div className="border-t border-white/10 pt-4">
                <button
                  onClick={() => togglePlatform("none")}
                  className={`w-full p-3 rounded-xl border-2 transition-all ${
                    formData.noPresence
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  }`}
                >
                  <span className="text-white text-sm">
                    {t("assessment.digitalPresence.noPresenceLabel")}
                  </span>
                  {formData.noPresence && (
                    <span className="text-cyan-400 ml-2 text-xs">✓</span>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      }

      // ── MONETIZATION ─────────────────────────────────────────────────────
      case "monetization":
        return (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {t("assessment.monetization.title")}
            </h2>
            <p className="text-white/60 text-sm text-center mb-5">
              {t("assessment.monetization.subtitle")}
            </p>
            <div className="space-y-3">
              {(["yes", "not-yet", "no"] as const).map((val) => {
                const meta = {
                  yes: {
                    emoji: "💰",
                    title: t("assessment.monetization.yesTitle"),
                    desc: t("assessment.monetization.yesDescription"),
                    color: "border-emerald-400 bg-emerald-400/10",
                    check: "text-emerald-400",
                  },
                  "not-yet": {
                    emoji: "🚀",
                    title: t("assessment.monetization.notYetTitle"),
                    desc: t("assessment.monetization.notYetDescription"),
                    color: "border-cyan-400 bg-cyan-400/10",
                    check: "text-cyan-400",
                  },
                  no: {
                    emoji: "🌱",
                    title: t("assessment.monetization.noTitle"),
                    desc: t("assessment.monetization.noDescription"),
                    color: "border-purple-400 bg-purple-400/10",
                    check: "text-purple-400",
                  },
                }[val];
                const isSelected = formData.monetization === val;
                return (
                  <button
                    key={val}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, monetization: val }))
                    }
                    className={`w-full p-4 rounded-2xl border-2 transition-all text-left ${isSelected ? meta.color : "border-white/10 bg-white/5 hover:border-white/30"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{meta.emoji}</span>
                        <div>
                          <p className="text-white text-sm font-medium">
                            {meta.title}
                          </p>
                          <p className="text-white/60 text-xs">{meta.desc}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <span className={`${meta.check} text-sm`}>✓</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {formData.monetization === "yes" && (
              <div className="mt-4 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <label className="text-white text-sm mb-2 block">
                  {t("assessment.monetization.detailsLabel")}
                </label>
                <textarea
                  value={formData.monetizationDetails}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      monetizationDetails: e.target.value,
                    }))
                  }
                  placeholder={t("assessment.monetization.detailsPlaceholder")}
                  rows={3}
                  className="w-full bg-black/40 border border-emerald-500/30 text-white placeholder-white/30 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-400 resize-none text-sm"
                />
              </div>
            )}
          </div>
        );

      // ── ACCOMPANIMENT ────────────────────────────────────────────────────
      case "accompaniment": {
        const { journeyStage } = formData;
        const helpNs =
          journeyStage === "starting"
            ? "startingHelp"
            : journeyStage === "legacy"
              ? "legacyHelp"
              : "existingHelp";
        const helpKeys = {
          startingHelp: [
            "clearRoadmap",
            "nichePositioning",
            "contentStrategy",
            "platformGuidance",
            "firstFollowers",
            "accountability",
          ],
          existingHelp: [
            "breakPlateau",
            "monetization",
            "contentOptimization",
            "collabOpportunities",
            "automationSystems",
            "growthStrategy",
          ],
          legacyHelp: [
            "scaleOperations",
            "multipleRevenue",
            "ipLicensing",
            "marketExpansion",
            "empireSystems",
            "strategicPartnerships",
          ],
        }[helpNs];
        const helpLabels = helpKeys.map((k) => {
          const raw = t.raw(`assessment.accompaniment.${helpNs}.${k}`) as {
            label: string;
          };
          return raw.label;
        });
        const titleKey = `assessment.accompaniment.title${journeyStage === "starting" ? "Starting" : journeyStage === "legacy" ? "Legacy" : "Existing"}`;
        const subtitleKey = `assessment.accompaniment.subtitle${journeyStage === "starting" ? "Starting" : journeyStage === "legacy" ? "Legacy" : "Existing"}`;

        return (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-1 text-center">
              {t(titleKey)}
            </h2>
            <p className="text-white/60 text-sm text-center mb-5">
              {t(subtitleKey)}
            </p>
            <div className="bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 border-2 border-cyan-500/20 rounded-2xl p-4">
              <div className="flex flex-wrap gap-3">
                {helpLabels.map((label, i) => {
                  const isSelected = formData.accompaniment.includes(label);
                  const c = CHIP_COLORS[i % CHIP_COLORS.length];
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        toggleChip(
                          formData.accompaniment,
                          label,
                          "accompaniment",
                        )
                      }
                      className={`py-2.5 px-5 rounded-full border-2 transition-all text-sm font-medium ${
                        isSelected
                          ? `${c.border} ${c.bg} ${c.text}`
                          : `border-white/10 bg-white/5 text-white/70 ${c.hover}`
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 pt-5 border-t border-white/10">
                <label className="text-white/80 text-sm mb-2 block">
                  ✨ {t("assessment.accompaniment.customLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.customHelp}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        customHelp: e.target.value,
                      }))
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      addCustomChip(
                        formData.customHelp,
                        formData.accompaniment,
                        "accompaniment",
                        "customHelp",
                      )
                    }
                    className="flex-1 bg-black/40 border border-cyan-500/30 text-white placeholder-white/30 rounded-xl px-4 py-2.5 focus:outline-none focus:border-cyan-400 text-sm"
                  />
                  <button
                    onClick={() =>
                      addCustomChip(
                        formData.customHelp,
                        formData.accompaniment,
                        "accompaniment",
                        "customHelp",
                      )
                    }
                    disabled={!formData.customHelp.trim()}
                    className="bg-gradient-to-r from-cyan-500 to-purple-500 disabled:opacity-30 text-white px-4 rounded-xl text-sm font-medium"
                  >
                    {t("assessment.accompaniment.addButton")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // ── NAME ─────────────────────────────────────────────────────────────
      case "name":
        return (
          <div className="max-w-md mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              {t("assessment.final.nameStepTitle")}
            </h2>
            <p className="text-white/60 text-sm mb-6">
              {t("assessment.final.nameStepDescription")}
            </p>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={t("assessment.final.namePlaceholder")}
              autoFocus
              className="w-full px-4 py-4 rounded-xl bg-black/40 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 text-center text-lg"
            />
          </div>
        );

      // ── PASSWORD ─────────────────────────────────────────────────────────
      case "password":
        return (
          <div className="max-w-md mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              {t("assessment.final.passwordStepTitle")}
            </h2>
            <p className="text-white/60 text-sm mb-6">
              {t("assessment.final.passwordStepDescription")}
            </p>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder={t("assessment.final.passwordPlaceholder")}
              autoFocus
              className="w-full px-4 py-4 rounded-xl bg-black/40 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 text-center text-lg"
            />
            {formData.password.length > 0 && formData.password.length < 8 && (
              <p className="text-orange-400 text-xs mt-2">
                {t("assessment.final.passwordError")}
              </p>
            )}
          </div>
        );

      // ── EMAIL ─────────────────────────────────────────────────────────────
      case "email":
        return (
          <div className="max-w-md mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              {t("assessment.final.emailStepTitle")}
            </h2>
            <p className="text-white/60 text-sm mb-6">
              {t("assessment.final.emailStepDescription")}
            </p>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder={t("assessment.final.emailPlaceholder")}
              autoFocus
              className="w-full px-4 py-4 rounded-xl bg-black/40 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 text-center text-lg mb-6"
            />
            <div className="text-left flex items-start gap-3">
              <input
                type="checkbox"
                id="gdpr"
                checked={formData.gdprConsent}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    gdprConsent: e.target.checked,
                  }))
                }
                className="mt-1 w-4 h-4 accent-cyan-400 cursor-pointer"
              />
              <label
                htmlFor="gdpr"
                className="text-white/80 text-sm cursor-pointer leading-relaxed"
              >
                {t("assessment.final.gdprConsentLabel")}{" "}
                <Link href="/terms" className="text-cyan-400 underline">
                  {t("assessment.final.termsLink")}
                </Link>
              </label>
            </div>
            {signupError && (
              <p className="text-red-400 text-sm mt-4">{signupError}</p>
            )}
          </div>
        );

      // ── VERIFY ────────────────────────────────────────────────────────────
      case "verify":
        return (
          <div className="max-w-lg mx-auto text-center">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center">
                  <span className="text-4xl">✉️</span>
                </div>
              </div>
              <div className="absolute -top-2 -right-2 w-10 h-10 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center border-4 border-black shadow-lg animate-bounce">
                <span className="text-white text-sm">✓</span>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-4">
              {t("assessment.verifyEmail.emailSentTitle")}
            </h2>
            <p className="text-white/80 text-lg mb-8 leading-relaxed">
              {t("assessment.verifyEmail.emailSentMessage")}
            </p>

            <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-2xl p-6 mb-8">
              <p className="text-white/60 text-xs uppercase tracking-wider mb-2">
                {t("assessment.verifyEmail.sentTo")}
              </p>
              <p className="text-cyan-400 text-xl font-bold break-all">
                {formData.email}
              </p>
              <p className="text-yellow-400/80 text-sm mt-3">
                ⚠️ {t("assessment.verifyEmail.checkSpam")}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => router.push("/subscribe")}
                className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-semibold py-4 rounded-2xl text-lg shadow-lg shadow-emerald-500/30 transition-all"
              >
                ✓ {t("assessment.verifyEmail.verified")} →
              </button>
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/20 text-white py-3 rounded-2xl text-sm transition-all disabled:opacity-50"
              >
                {resending
                  ? t("assessment.verifyEmail.sending")
                  : `🔄 ${t("assessment.verifyEmail.resend")}`}
              </button>
            </div>
            <p className="text-white/40 text-xs mt-6 italic">
              💡 {t("assessment.verifyEmail.note")}
            </p>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-purple-600/8 via-transparent to-cyan-600/8 blur-3xl rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-cyan-600/8 via-transparent to-emerald-600/8 blur-3xl rounded-full" />
      </div>

      {/* Header */}
      <nav className="bg-black/80 backdrop-blur-sm fixed w-full z-50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="text-white font-bold text-xl bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            glimad
          </span>
          {stepName !== "verify" && (
            <button
              onClick={() => router.push("/")}
              className="border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </nav>

      {/* Progress bar */}
      <div className="fixed top-16 left-0 right-0 z-40 bg-black/50 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/50 text-xs">
              Step {step + 1} of {totalSteps}
            </span>
            <span className="text-cyan-400 text-xs font-medium">
              {progress}%
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-500 to-pink-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pt-36 pb-24 px-4 relative z-10">
        <div className="max-w-6xl mx-auto">
          {renderStep()}

          {/* Navigation buttons */}
          {stepName !== "welcome" && stepName !== "verify" && (
            <div className="flex justify-between items-center mt-10 max-w-3xl mx-auto">
              <button
                onClick={handleBack}
                className="border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 px-6 py-3 rounded-xl text-sm transition-colors"
              >
                ← {t("assessment.back")}
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed() || loading || !sessionId}
                className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl text-sm transition-all"
              >
                {loading ? "..." : `${t("assessment.continue")} →`}
              </button>
            </div>
          )}

          {/* Welcome step: no back button, CTA is inline */}
          {stepName === "verify" && (
            <div className="flex justify-center mt-8 max-w-3xl mx-auto">
              <button
                onClick={handleBack}
                className="border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 px-6 py-3 rounded-xl text-sm transition-colors"
              >
                ← {t("assessment.back")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
