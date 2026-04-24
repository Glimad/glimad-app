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
    ];
    return flow[step - 3] ?? "accompaniment";
  }
  const flow: StepName[] = [
    "goals",
    "blockers",
    "platforms",
    "monetization",
    "accompaniment",
  ];
  return flow[step - 3] ?? "accompaniment";
}

// Platform config with brand colors and icons (SVG paths)
const PLATFORM_CONFIG: Record<
  string,
  { color: string; bg: string; icon: React.ReactNode }
> = {
  instagram: {
    color: "#E1306C",
    bg: "linear-gradient(135deg, #833AB4, #E1306C, #F77737)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  tiktok: {
    color: "#FF0050",
    bg: "linear-gradient(135deg, #010101, #FF0050)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z" />
      </svg>
    ),
  },
  youtube: {
    color: "#FF0000",
    bg: "linear-gradient(135deg, #CC0000, #FF0000)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
      </svg>
    ),
  },
  twitter: {
    color: "#FFFFFF",
    bg: "linear-gradient(135deg, #14171A, #2D2D2D)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  linkedin: {
    color: "#0A66C2",
    bg: "linear-gradient(135deg, #0A66C2, #004182)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  facebook: {
    color: "#1877F2",
    bg: "linear-gradient(135deg, #1877F2, #0050B3)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  spotify: {
    color: "#1DB954",
    bg: "linear-gradient(135deg, #1DB954, #157A38)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  behance: {
    color: "#1769FF",
    bg: "linear-gradient(135deg, #1769FF, #053EB5)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M22 7h-7V5h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14H15.97c.13 3.211 3.483 3.312 4.588 2.029H23.726zm-7.726-3h3.543c-.157-1.751-1.031-2.188-1.798-2.188-.769 0-1.637.432-1.745 2.188zM7.496 9.016a4.16 4.16 0 0 0 1.96-3.524C9.456 2.968 6.8 2 4.855 2H0v16h4.855c5.29 0 6.647-4.057 6.647-5.985 0-1.97-.98-2.903-3.978-3.009h.012zm-4.65-5.03h1.987c.858 0 2.178.156 2.178 1.576 0 1.297-.858 1.577-1.96 1.577H2.846V3.986zm0 10.029v-4.155h2.082c1.543 0 2.765.32 2.765 2.028 0 1.73-1.258 2.127-2.765 2.127H2.846z" />
      </svg>
    ),
  },
  pinterest: {
    color: "#E60023",
    bg: "linear-gradient(135deg, #E60023, #A0001A)",
    icon: (
      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
      </svg>
    ),
  },
  website: {
    color: "#00C9A7",
    bg: "linear-gradient(135deg, #00C9A7, #48CAE4)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        className="w-5 h-5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20" />
      </svg>
    ),
  },
  other: {
    color: "#888",
    bg: "linear-gradient(135deg, #555, #333)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        className="w-5 h-5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20" />
      </svg>
    ),
  },
};

const PROJECT_TYPES = [
  {
    id: "music",
    icon: "🎵",
    gradient: "linear-gradient(135deg, #833AB4, #E1306C)",
  },
  {
    id: "visual",
    icon: "🎨",
    gradient: "linear-gradient(135deg, #F77737, #E1306C)",
  },
  {
    id: "creator",
    icon: "🎬",
    gradient: "linear-gradient(135deg, #0575E6, #00CAE4)",
  },
  {
    id: "brand/business",
    icon: "💼",
    gradient: "linear-gradient(135deg, #00C9A7, #48CAE4)",
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

// Accent colors cycling for chips
const CHIP_ACCENTS = [
  { border: "1px solid #48CAE4", bg: "rgba(72,202,228,0.12)", text: "#48CAE4" },
  {
    border: "1px solid #9B6BFF",
    bg: "rgba(155,107,255,0.12)",
    text: "#9B6BFF",
  },
  {
    border: "1px solid #FF6B9D",
    bg: "rgba(255,107,157,0.12)",
    text: "#FF6B9D",
  },
  { border: "1px solid #F77737", bg: "rgba(247,119,55,0.12)", text: "#F77737" },
  { border: "1px solid #00C9A7", bg: "rgba(0,201,167,0.12)", text: "#00C9A7" },
];

const BLOCKER_ACCENTS = [
  {
    border: "1px solid #FF6B6B",
    bg: "rgba(255,107,107,0.12)",
    text: "#FF6B6B",
  },
  { border: "1px solid #F77737", bg: "rgba(247,119,55,0.12)", text: "#F77737" },
  {
    border: "1px solid #FF6B9D",
    bg: "rgba(255,107,157,0.12)",
    text: "#FF6B9D",
  },
  { border: "1px solid #FFBB33", bg: "rgba(255,187,51,0.12)", text: "#FFBB33" },
  {
    border: "1px solid #FF6B6B",
    bg: "rgba(255,107,107,0.12)",
    text: "#FF6B6B",
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
  const [showTerms, setShowTerms] = useState(false);
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
  const totalSteps = 8;
  const stepProgressMap: Record<number, number> = {
    0: 10,
    1: 22,
    2: formData.journeyStage ? 35 : 31,
    3: 47,
    4: 60,
    5: 72,
    6: 85,
    7: 95,
  };
  // Progress maxes at 95% on the last step — it only hits 100% once the user
  // submits and /complete succeeds. If they close the tab on step 8, the
  // session stays 'in_progress' and they'll restart from step 1 next visit.
  const progress =
    stepProgressMap[step] ?? Math.round(((step + 1) / totalSteps) * 100);

  useEffect(() => {
    const visitorId =
      localStorage.getItem("glimad_visitor_id") ?? crypto.randomUUID();
    localStorage.setItem("glimad_visitor_id", visitorId);

    // Drop any stale cookie left from the legacy anonymous flow.
    document.cookie = "glimad_onboarding_sid=; path=/; max-age=0";

    fetch("/api/onboarding/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: visitorId }),
    })
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        if (r.status === 409) {
          // Already completed — middleware should have redirected, defensive fallback.
          router.replace("/subscribe");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.onboarding_session_id) {
          setSessionId(data.onboarding_session_id);
        }
      });
  }, [router]);

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

    if (stepName !== "welcome") {
      const responses = getStepResponses();
      if (Object.keys(responses).length > 0) {
        await patchStep(responses);
      }
    }

    // accompaniment is the terminal step in the web flow — sign-up already happened
    // before onboarding, so we just finalize and hand off to /subscribe.
    if (stepName === "accompaniment") {
      const meta = {
        locale: navigator.language.slice(0, 2),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const res = await fetch(`/api/onboarding/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_responses: meta }),
      });
      if (!res.ok) {
        setSignupError("Could not complete onboarding. Please try again.");
        setLoading(false);
        return;
      }
      router.push("/subscribe");
      return;
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

  async function handleVerified() {
    if (loading) return;
    setLoading(true);
    setSignupError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      router.push("/subscribe");
      return;
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      router.push("/subscribe");
      return;
    }

    setSignupError(t("assessment.verifyEmail.notVerifiedYet"));
    setLoading(false);
  }

  function renderStep() {
    switch (stepName) {
      // ── WELCOME ──────────────────────────────────────────────────────────
      case "welcome":
        return (
          <div
            className="text-center max-w-2xl mx-auto"
            style={{ padding: "0 16px" }}
          >
            {/* Sparkle Icon Circle */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 via-emerald-400 to-pink-500 flex items-center justify-center animate-pulse">
                <svg
                  className="w-8 h-8 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z" />
                </svg>
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <h1
                className="font-bold text-white"
                style={{ fontSize: "48px", fontWeight: 700, lineHeight: 1.1 }}
              >
                {t("assessment.welcome.title")}
              </h1>
              <h2
                className="font-semibold"
                style={{
                  background:
                    "linear-gradient(to right, #48CAE4, #00C9A7, #FF6B9D)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontSize: "24px",
                  fontWeight: 600,
                }}
              >
                {t("assessment.welcome.subtitle")}
              </h2>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "16px" }}>
                {t("assessment.welcome.tagline")}
              </p>
            </div>

            {/* Build My Evolution Map */}
            <div className="space-y-3">
              <button
                onClick={handleNext}
                className="text-white font-semibold transition-all duration-300 hover:opacity-95 hover:translate-y-[-1px]"
                style={{
                  background:
                    "linear-gradient(90deg, #00D6C9 0%, #00C389 100%)",
                  borderRadius: "6px",
                  padding: "18px 40px",
                  fontSize: "17px",
                  fontWeight: 700,
                  lineHeight: "20px",
                  letterSpacing: "-0.2px",
                  zIndex: 10,
                  boxShadow: "0px 14px 28px rgba(0, 214, 201, 0.25)",
                }}
              >
                {t("assessment.welcome.cta")} ›
              </button>

              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
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
            <p
              className="text-center mb-6"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
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
                    className="relative p-4 text-left transition-all"
                    style={{
                      borderRadius: "12px",
                      background: isSelected
                        ? "rgba(0,201,167,0.08)"
                        : "rgba(255,255,255,0.04)",
                      border: isSelected
                        ? "1px solid #00C9A7"
                        : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      className="flex items-center justify-center mb-3"
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: type.gradient,
                        fontSize: "20px",
                      }}
                    >
                      {type.icon}
                    </div>
                    <span className="text-white text-sm font-medium">
                      {t(
                        `assessment.projectTypes.${type.id === "brand/business" ? "personalBrand" : type.id}`,
                      )}
                    </span>
                    {isSelected && (
                      <div
                        className="absolute flex items-center justify-center"
                        style={{
                          top: "12px",
                          right: "12px",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "#00C9A7",
                        }}
                      >
                        <span
                          style={{
                            color: "#000",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </span>
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
                className="w-full text-white focus:outline-none"
                style={{
                  padding: "14px 16px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: "14px",
                  caretColor: "#00C9A7",
                }}
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
            <p
              className="text-center mb-6"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {t("assessment.journeyStage.subtitle")}
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              {(["starting", "existing", "legacy"] as const).map(
                (stage, idx) => {
                  const colors = [
                    {
                      border: "#F77737",
                      bg: "rgba(247,119,55,0.08)",
                      iconBg: "rgba(247,119,55,0.2)",
                      icon: "🚀",
                      check: "#F77737",
                    },
                    {
                      border: "#00C9A7",
                      bg: "rgba(0,201,167,0.08)",
                      iconBg: "rgba(0,201,167,0.2)",
                      icon: "📈",
                      check: "#00C9A7",
                    },
                    {
                      border: "#9B6BFF",
                      bg: "rgba(155,107,255,0.08)",
                      iconBg: "rgba(155,107,255,0.2)",
                      icon: "🏆",
                      check: "#9B6BFF",
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
                      className="relative p-5 text-left transition-all"
                      style={{
                        borderRadius: "12px",
                        background: isSelected
                          ? c.bg
                          : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isSelected ? c.border : "rgba(255,255,255,0.1)"}`,
                      }}
                    >
                      <div
                        className="flex items-center justify-center mb-3"
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "50%",
                          background: c.iconBg,
                          fontSize: "22px",
                        }}
                      >
                        {c.icon}
                      </div>
                      <h3 className="text-white font-semibold mb-2 text-sm">
                        {t(`assessment.journeyStage.${stage}.title`)}
                      </h3>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.6)",
                          fontSize: "13px",
                          lineHeight: "1.5",
                        }}
                      >
                        {t(`assessment.journeyStage.${stage}.description`)}
                      </p>
                      {isSelected && (
                        <div
                          className="absolute flex items-center justify-center"
                          style={{
                            top: "16px",
                            right: "16px",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: c.check,
                          }}
                        >
                          <span
                            style={{
                              color: "#000",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </span>
                        </div>
                      )}
                    </button>
                  );
                },
              )}
            </div>
            {/* Hint bar */}
            <div
              className="mt-5 p-4 flex items-center gap-3"
              style={{
                borderRadius: "12px",
                background: "rgba(155,107,255,0.08)",
                border: "1px solid rgba(155,107,255,0.2)",
              }}
            >
              <span style={{ fontSize: "18px" }}>💡</span>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                {t("assessment.journeyStage.helpNote")}
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
            <p
              className="text-center mb-6"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {t("assessment.yourIdea.subtitle")}
            </p>

            {!formData.useAIHelp ? (
              <>
                <div
                  className="p-6 mb-4"
                  style={{
                    borderRadius: "16px",
                    background: "rgba(155,107,255,0.05)",
                    border: "1px solid rgba(155,107,255,0.4)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: "20px" }}>💡</span>
                    <span className="text-white text-medium font-medium">
                      {t("assessment.yourIdea.describeLabel")}
                    </span>
                    <div className="relative group flex-shrink-0">
                      <div
                        className="flex items-center justify-center cursor-pointer"
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          border: "1px solid rgba(72, 202, 228, 0.9)",
                          fontSize: "11px",
                          fontWeight: 900,
                          color: "rgb(72, 202, 228)",
                          flexShrink: 0,
                        }}
                      >
                        ℹ
                      </div>
                      {/* Tooltip */}
                      <div
                        className="absolute hidden group-hover:block z-50"
                        style={{
                          bottom: "28px",
                          left: "50%",
                          transform: "translateX(-60%)",
                          width: "300px",
                          fontWeight: 500,
                          background: "rgba(0, 0, 0, 0.8)",
                          borderRadius: "10px",
                          padding: "12px 14px",
                        }}
                      >
                        <p
                          className="font-medium mb-1"
                          style={{
                            color: "rgb(54, 201, 231)",
                            fontSize: "15px",
                          }}
                        >
                          {t("assessment.yourIdea.thinkAbout")}
                        </p>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.8)",
                            fontSize: "15px",
                            lineHeight: 1.5,
                          }}
                        >
                          {t("assessment.yourIdea.specificity")}
                        </p>
                      </div>
                    </div>
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
                    className="w-full text-white focus:outline-none resize-none"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(155,107,255,0.3)",
                      borderRadius: "8px",
                      padding: "14px 16px",
                      fontSize: "13px",
                      caretColor: "#9B6BFF",
                    }}
                  />
                  {formData.projectIdea.length >= 15 && (
                    <p
                      style={{
                        color: "#00C9A7",
                        fontSize: "12px",
                        marginTop: "8px",
                      }}
                    >
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
                  className="w-full text-center text-sm transition-colors"
                  style={{ color: "#00C9A7" }}
                >
                  {t("assessment.yourIdea.switchToAIHelp")}
                </button>
              </>
            ) : (
              <>
                <div
                  className="p-6 mb-4"
                  style={{
                    borderRadius: "16px",
                    background: "rgba(0,201,167,0.05)",
                    border: "1px solid rgba(0,201,167,0.3)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: "20px" }}>🤖</span>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {t("assessment.yourIdea.aiHelpTitle")}
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.6)",
                          fontSize: "12px",
                        }}
                      >
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
                    className="w-full text-white focus:outline-none"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(0,201,167,0.3)",
                      borderRadius: "8px",
                      padding: "14px 16px",
                      fontSize: "13px",
                      caretColor: "#00C9A7",
                    }}
                  />
                  {formData.projectNiche.trim().length > 3 && (
                    <p
                      style={{
                        color: "#00C9A7",
                        fontSize: "12px",
                        marginTop: "8px",
                      }}
                    >
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
                  className="w-full text-center text-sm transition-colors"
                  style={{ color: "#9B6BFF" }}
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
            <p
              className="text-center mb-5"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {t("assessment.goalsBlockers.subtitle")}
            </p>
            <div
              className="p-6"
              style={{
                borderRadius: "16px",
                background: "rgba(155,107,255,0.04)",
                border: "1px solid rgba(155,107,255,0.15)",
              }}
            >
              <p
                className="text-center mb-4"
                style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}
              >
                {t("assessment.goalsBlockers.goalsHint")}
              </p>
              <div className="flex flex-wrap gap-3">
                {goalLabels.map((label, i) => {
                  const isSelected = formData.goals.includes(label);
                  const c = CHIP_ACCENTS[i % CHIP_ACCENTS.length];
                  return (
                    <button
                      key={label}
                      onClick={() => toggleChip(formData.goals, label, "goals")}
                      className="transition-all text-sm font-medium"
                      style={{
                        padding: "8px 18px",
                        borderRadius: "999px",
                        background: isSelected
                          ? c.bg
                          : "rgba(255,255,255,0.06)",
                        border: isSelected
                          ? c.border
                          : "1px solid rgba(255,255,255,0.15)",
                        color: isSelected ? c.text : "rgba(255,255,255,0.8)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-5 pt-5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
              >
                <label
                  className="block text-bold mb-2"
                  style={{ color: "rgba(255, 255, 255, 0.78)" }}
                >
                  ✦ {t("assessment.goalsBlockers.customGoalLabel")}
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
                    className="flex-1 text-white focus:outline-none text-sm"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      caretColor: "#00C9A7",
                    }}
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
                    className="text-white text-sm font-medium disabled:opacity-30 transition-opacity"
                    style={{
                      background: "rgba(0,201,167,0.7)",
                      borderRadius: "6px",
                      padding: "8px 16px",
                    }}
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
            <p
              className="text-center mb-5"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {t("assessment.goalsBlockers.goalsHint")}
            </p>
            <div
              className="p-6"
              style={{
                borderRadius: "16px",
                background: "rgba(255,100,100,0.04)",
                border: "1px solid rgba(255,100,100,0.3)",
              }}
            >
              <div className="flex flex-wrap gap-3">
                {blockerLabels.map((label, i) => {
                  const isSelected = formData.blockers.includes(label);
                  const c = BLOCKER_ACCENTS[i % BLOCKER_ACCENTS.length];
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        toggleChip(formData.blockers, label, "blockers")
                      }
                      className="transition-all text-sm font-medium"
                      style={{
                        padding: "8px 18px",
                        borderRadius: "999px",
                        background: isSelected
                          ? c.bg
                          : "rgba(255,255,255,0.06)",
                        border: isSelected
                          ? c.border
                          : "1px solid rgba(255,255,255,0.15)",
                        color: isSelected ? c.text : "rgba(255,255,255,0.8)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-5 pt-5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
              >
                <label
                  className="block text-bold mb-2"
                  style={{ color: "rgba(255, 255, 255, 0.78)" }}
                >
                  ✦ {t("assessment.goalsBlockers.customBlockerLabel")}
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
                    className="flex-1 text-white focus:outline-none text-sm"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,100,100,0.3)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      caretColor: "#FF6B6B",
                    }}
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
                    className="text-white text-sm font-medium disabled:opacity-30 transition-opacity"
                    style={{
                      background: "rgba(255,100,100,0.5)",
                      borderRadius: "6px",
                      padding: "8px 16px",
                    }}
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
            <p
              className="text-center mb-5"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {isStarting
                ? t("assessment.digitalPresence.subtitleStarting")
                : t("assessment.digitalPresence.subtitleExisting")}
            </p>

            {formData.selectedPlatforms.length >= 3 && !formData.noPresence && (
              <div
                className="rounded-xl p-3 mb-4 text-center"
                style={{
                  background: "rgba(0,201,167,0.08)",
                  border: "1px solid rgba(0,201,167,0.3)",
                }}
              >
                <p style={{ color: "#00C9A7", fontSize: "13px" }}>
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
                const cfg = PLATFORM_CONFIG[platform.id];
                return (
                  <div key={platform.id}>
                    <button
                      onClick={() => togglePlatform(platform.id)}
                      disabled={isDisabled}
                      className="w-full p-3 text-left transition-all"
                      style={{
                        borderRadius: "12px",
                        background: isSelected
                          ? "rgba(0,201,167,0.08)"
                          : isDisabled
                            ? "rgba(255,255,255,0.02)"
                            : "rgba(255,255,255,0.04)",
                        border: isSelected
                          ? "1px solid #00C9A7"
                          : isDisabled
                            ? "1px solid rgba(255,255,255,0.05)"
                            : "1px solid rgba(255,255,255,0.1)",
                        opacity: isDisabled ? 0.4 : 1,
                        cursor: isDisabled ? "not-allowed" : "pointer",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* Platform brand icon */}
                        <div
                          className="flex items-center justify-center flex-shrink-0"
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: cfg?.bg ?? "#555",
                          }}
                        >
                          {cfg?.icon}
                        </div>
                        <span className="text-white text-sm flex-1">
                          {t(`assessment.platforms.${platform.id}`)}
                        </span>
                        {isSelected && (
                          <span style={{ color: "#00C9A7", fontSize: "13px" }}>
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
                        className="mt-2 w-full text-white focus:outline-none text-xs"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: "8px",
                          padding: "10px 12px",
                          caretColor: "#00C9A7",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {isStarting && (
              <div
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: "16px",
                }}
              >
                <button
                  onClick={() => togglePlatform("none")}
                  className="w-full p-4 transition-all"
                  style={{
                    borderRadius: "12px",
                    background: formData.noPresence
                      ? "rgba(0,201,167,0.08)"
                      : "rgba(255,255,255,0.04)",
                    border: formData.noPresence
                      ? "1px solid #00C9A7"
                      : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-white text-sm font-medium">
                      {t("assessment.digitalPresence.noPresenceLabel")}
                    </span>
                    {formData.noPresence && (
                      <span style={{ color: "#00C9A7", fontSize: "13px" }}>
                        ✓
                      </span>
                    )}
                  </div>
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
            <p
              className="text-center mb-5"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {t("assessment.monetization.subtitle")}
            </p>
            <div className="space-y-3">
              {(["yes", "not-yet", "no"] as const).map((val) => {
                const meta = {
                  yes: {
                    emoji: "💰",
                    title: t("assessment.monetization.yesTitle"),
                    desc: t("assessment.monetization.yesDescription"),
                    borderColor: "#00C9A7",
                    bg: "rgba(0,201,167,0.08)",
                  },
                  "not-yet": {
                    emoji: "🚀",
                    title: t("assessment.monetization.notYetTitle"),
                    desc: t("assessment.monetization.notYetDescription"),
                    borderColor: "#48CAE4",
                    bg: "rgba(72,202,228,0.08)",
                  },
                  no: {
                    emoji: "🌱",
                    title: t("assessment.monetization.noTitle"),
                    desc: t("assessment.monetization.noDescription"),
                    borderColor: "#9B6BFF",
                    bg: "rgba(155,107,255,0.08)",
                  },
                }[val];
                const isSelected = formData.monetization === val;
                return (
                  <button
                    key={val}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, monetization: val }))
                    }
                    className="w-full p-4 text-left transition-all"
                    style={{
                      borderRadius: "12px",
                      background: isSelected
                        ? meta.bg
                        : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isSelected ? meta.borderColor : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: "22px" }}>{meta.emoji}</span>
                        <div>
                          <p className="text-white text-sm font-medium">
                            {meta.title}
                          </p>
                          <p
                            style={{
                              color: "rgba(255,255,255,0.6)",
                              fontSize: "12px",
                            }}
                          >
                            {meta.desc}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <span
                          style={{ color: meta.borderColor, fontSize: "14px" }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {formData.monetization === "yes" && (
              <div
                className="mt-4 p-4"
                style={{
                  borderRadius: "16px",
                  background: "rgba(0,201,167,0.06)",
                  border: "1px solid rgba(0,201,167,0.2)",
                }}
              >
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
                  className="w-full text-white focus:outline-none resize-none text-sm"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(0,201,167,0.3)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    caretColor: "#00C9A7",
                  }}
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
            <p
              className="text-center mb-5"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
              {t(subtitleKey)}
            </p>
            <div
              className="p-6"
              style={{
                borderRadius: "16px",
                background: "rgba(0,201,167,0.04)",
                border: "1px solid rgba(0,201,167,0.2)",
              }}
            >
              <div className="flex flex-wrap gap-3">
                {helpLabels.map((label, i) => {
                  const isSelected = formData.accompaniment.includes(label);
                  const c = CHIP_ACCENTS[i % CHIP_ACCENTS.length];
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
                      className="transition-all text-sm font-medium"
                      style={{
                        padding: "8px 18px",
                        borderRadius: "999px",
                        background: isSelected
                          ? c.bg
                          : "rgba(255,255,255,0.06)",
                        border: isSelected
                          ? c.border
                          : "1px solid rgba(255,255,255,0.15)",
                        color: isSelected ? c.text : "rgba(255,255,255,0.8)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-5 pt-5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
              >
                <label
                  className="block text-sm mb-2"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  ✦ {t("assessment.accompaniment.customLabel")}
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
                    className="flex-1 text-white focus:outline-none text-sm"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      caretColor: "#00C9A7",
                    }}
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
                    className="text-white text-sm font-medium disabled:opacity-30 transition-opacity"
                    style={{
                      background: "rgba(0,201,167,0.7)",
                      borderRadius: "6px",
                      padding: "8px 16px",
                    }}
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
            <p
              className="mb-6"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
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
              className="w-full text-white focus:outline-none text-center"
              style={{
                fontSize: "18px",
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.2)",
                caretColor: "#00C9A7",
              }}
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
            <p
              className="mb-6"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
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
              className="w-full text-white focus:outline-none text-center"
              style={{
                fontSize: "18px",
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.2)",
                caretColor: "#00C9A7",
              }}
            />
            {formData.password.length > 0 && formData.password.length < 8 && (
              <p
                className="mt-2"
                style={{ color: "#FF6B6B", fontSize: "13px" }}
              >
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
            <p
              className="mb-6"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}
            >
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
              className="w-full text-white focus:outline-none text-center mb-6"
              style={{
                fontSize: "18px",
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.2)",
                caretColor: "#00C9A7",
              }}
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
                className="mt-1 w-4 h-4 cursor-pointer"
                style={{ accentColor: "#101212" }}
              />
              <label
                htmlFor="gdpr"
                className="text-sm cursor-pointer leading-relaxed"
                style={{ color: "rgba(255,255,255,0.8)" }}
              >
                {t("assessment.final.gdprConsentLabel")}{" "}
                <button
                  onClick={() => setShowTerms(true)}
                  style={{ color: "#22D3EE", fontWeight: "700" }}
                  className="underline"
                >
                  {t("assessment.final.termsLink")}
                </button>
              </label>
            </div>
            {signupError && (
              <p className="mt-4 text-sm" style={{ color: "#FF6B6B" }}>
                {signupError}
              </p>
            )}
          </div>
        );

      // ── VERIFY ────────────────────────────────────────────────────────────
      case "verify":
        return (
          <div
            className="max-w-lg mx-auto text-center"
            style={{ paddingTop: "0px" }}
          >
            {/* Animated envelope icon */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #00C9A7, #9B6BFF, #FF6B9D)",
                  padding: "9px",
                }}
              >
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                  <span style={{ fontSize: "36px" }}>✉️</span>
                </div>
              </div>
              <div
                className="absolute flex items-center justify-center animate-bounce"
                style={{
                  top: "-8px",
                  right: "-8px",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #00C9A7, #34D399)",
                  border: "3px solid black",
                }}
              >
                <span
                  style={{ color: "white", fontSize: "14px", fontWeight: 700 }}
                >
                  ✓
                </span>
              </div>
            </div>

            <h2
              className="font-bold text-white mb-4"
              style={{ fontSize: "28px" }}
            >
              {t("assessment.verifyEmail.emailSentTitle")}
            </h2>
            <p
              className="mb-8 leading-relaxed"
              style={{ color: "rgba(255,255,255,0.7)", fontSize: "16px" }}
            >
              {t("assessment.verifyEmail.emailSentMessage")}
            </p>

            {/* Email card */}
            <div
              className="rounded-2xl p-6 mb-8"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <p
                className="uppercase tracking-wider mb-2"
                style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}
              >
                {t("assessment.verifyEmail.sentTo")}
              </p>
              <p
                className="font-bold break-all mb-3"
                style={{ color: "#00C9A7", fontSize: "18px" }}
              >
                {formData.email}
              </p>
              <p style={{ color: "rgba(255,200,0,0.8)", fontSize: "13px" }}>
                ⚠️ {t("assessment.verifyEmail.checkSpam")}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {/* Primary gradient button */}
              <button
                onClick={handleVerified}
                disabled={loading}
                className="w-full font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(to right, #00C9A7, #48CAE4)",
                  borderRadius: "12px",
                  padding: "16px",
                  fontSize: "16px",
                  fontWeight: 600,
                }}
              >
                ✓ {t("assessment.verifyEmail.verified")} →
              </button>
              {signupError && (
                <p
                  className="mt-2 text-sm text-center"
                  style={{ color: "#FF6B6B" }}
                >
                  {signupError}
                </p>
              )}

              {/* Outlined resend button */}
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full font-medium text-white transition-all disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "12px",
                  padding: "14px",
                  fontSize: "14px",
                }}
              >
                {resending
                  ? t("assessment.verifyEmail.sending")
                  : `↻ ${t("assessment.verifyEmail.resend")}`}
              </button>
            </div>

            <p
              className="italic"
              style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}
            >
              💡 {t("assessment.verifyEmail.note")}
            </p>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    // REPLACE THIS entire outer div + atmospheric glow
    <div className="min-h-screen" style={{ background: "#080808" }}>
      {/* Atmospheric background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Teal glow — top-center, behind the sparkle icon */}
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "55%",
            transform: "translateX(-50%)",
            width: "700px",
            height: "500px",
            background:
              "radial-gradient(ellipse, rgba(0,200,160,0.22) 0%, transparent 20%)",
            filter: "blur(90px)",
          }}
        />

        {/* Purple glow — left-center, large and diffused */}
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "5%",
            width: "800px",
            height: "700px",
            background:
              "radial-gradient(ellipse, rgba(110,0,200,0.07) 0%, transparent 65%)",
            filter: "blur(100px)",
          }}
        />

        {/* Subtle cyan bottom-center bleed */}
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "600px",
            height: "400px",
            background:
              "radial-gradient(ellipse, rgba(0,140,180,0.06) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* Header nav */}
      <nav
        className="fixed w-full"
        style={{
          zIndex: 50,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          height: "64px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
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
          <div className="flex items-center gap-2">
            {/* Globe icon */}
            <button
              className="w-9 h-9 flex items-center justify-center"
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

            {/* Exit Assessment button — also signs out so re-entry requires
                re-login, matching what users intuit from the wording. */}
            {stepName !== "verify" && (
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/login");
                  router.refresh();
                }}
                className="text-sm font-bold px-5 py-2.5 rounded-md transition-all hover:opacity-90"
                style={{
                  background: "#FFFFFF",
                  color: "#38BDF8",
                  border: "1px solid rgba(56, 189, 248, 0.25)", // soft sky blue border
                }}
              >
                Exit Assessment
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Progress bar — fixed below nav, always visible */}
      <div
        className="fixed left-0 right-0"
        style={{
          top: "64px",
          zIndex: 39,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <span
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: "15px",
                fontWeight: 500,
              }}
            >
              Step {step + 1} of {totalSteps}
            </span>
            <span
              style={{ color: "#48CAE4", fontSize: "15px", fontWeight: 700 }}
            >
              {progress}%
            </span>
          </div>
          <div
            className="overflow-hidden"
            style={{
              height: "6px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "99px",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "99px",
                width: `${progress}%`,
                background:
                  "linear-gradient(to right, #00C9A7, #9B6BFF, #FF6B9D)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        className="relative z-10"
        style={{
          paddingTop: "150px",
          paddingBottom: "96px",
          paddingLeft: "16px",
          paddingRight: "16px",
        }}
      >
        <div className="max-w-6xl mx-auto">
          {renderStep()}

          {/* Navigation buttons */}
          {stepName !== "welcome" && stepName !== "verify" && (
            <div className="flex justify-between items-center mt-10 max-w-3xl mx-auto">
              <button
                onClick={handleBack}
                className="flex items-center gap-2 font-semibold text-gray-400 text-medium transition-colors"
                style={{
                  background: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  padding: "10px 20px",
                }}
              >
                ᐸ {t("assessment.back")}
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed() || loading || !sessionId}
                className="font-semibold text-white text-sm transition-all"
                style={{
                  background:
                    canProceed() && !loading && sessionId
                      ? "linear-gradient(to right, #00BFA5, #26C6DA)"
                      : "linear-gradient(to right, #00BFA5, #26C6DA)",
                  borderRadius: "10px",
                  padding: "14px 28px",
                  opacity: !canProceed() || loading || !sessionId ? 0.35 : 1,
                  cursor:
                    !canProceed() || loading || !sessionId
                      ? "not-allowed"
                      : "pointer",
                  fontWeight: 600,
                  fontSize: "15px",
                }}
              >
                {loading ? "..." : `${t("assessment.continue")} ᐳ`}
              </button>
            </div>
          )}

          {/* Verify step: centered back button */}
          {stepName === "verify" && (
            <div className="flex justify-center mt-8 max-w-3xl mx-auto">
              <button
                onClick={handleBack}
                className="flex items-center gap-2 font-medium text-gray-400 text-sm transition-colors"
                style={{
                  background: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  padding: "10px 20px",
                }}
              >
                ᐸ {t("assessment.back")}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Terms Modal */}
      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          onClick={() => setShowTerms(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 rounded-t-2xl"
              style={{
                background: "rgba(6, 6, 7, 0.95)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <h2 className="text-white font-semibold text-lg">
                Terms & Conditions, Privacy Policy
              </h2>
              <button
                onClick={() => setShowTerms(false)}
                className="text-white opacity-60 hover:opacity-100 transition-opacity text-xl"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content */}
            <div
              className="overflow-y-auto p-6 flex-1 modal-scroll"
              style={{
                background: `
  linear-gradient(135deg,
    rgba(26, 26, 46, 0.95) 0%,
    rgba(14, 14, 22, 0.98) 30%,
    rgba(0, 0, 0, 1) 100%
  )
`,
                color: "rgba(255,255,255,0.8)",
                fontSize: "14px",
                lineHeight: 1.7,
              }}
            >
              <h3 className="text-white font-semibold text-base mb-2">
                1. Introduction
              </h3>
              <p className="mb-4">
                By using GLIMAD and providing your information, you agree to
                these Terms & Conditions and our Privacy Policy. GLIMAD is
                committed to helping artists, creators, and entrepreneurs grow
                their creative careers through personalized guidance, AI-powered
                tools, and strategic partnerships.
              </p>

              <h3 className="text-white font-semibold text-base mb-2">
                2. Data We Collect
              </h3>
              <p className="mb-2">
                When you use GLIMAD, we collect the following information:
              </p>
              <ul className="list-disc pl-5 mb-4 space-y-1">
                <li>Personal Information: Name, email address, location</li>
                <li>
                  Project Information: Project type, name, creative stage, and
                  description
                </li>
                <li>
                  Goals & Blockers: Your creative goals, challenges, and
                  aspirations
                </li>
                <li>
                  Digital Presence: Social media platforms, URLs, and follower
                  counts
                </li>
                <li>
                  Preferences: Content style, target audience, niche
                  specificity, and monetization status
                </li>
              </ul>

              <h3 className="text-white font-semibold text-base mb-2">
                3. How We Use Your Data
              </h3>
              <ul className="list-disc pl-5 mb-4 space-y-1">
                <li>
                  Create your personalized Evolution Map and strategic action
                  plan
                </li>
                <li>Provide AI-powered recommendations and insights</li>
                <li>Improve and optimize the GLIMAD platform experience</li>
                <li>
                  Generate analytics and insights about your creative journey
                </li>
                <li>Provide customer support and respond to your inquiries</li>
              </ul>
              <div
                className="p-4 mb-4"
                style={{
                  background: `
  linear-gradient(120deg,
    rgba(0, 201, 167, 0.12) 0%,
    rgba(0, 201, 167, 0.08) 25%,
    rgba(15, 15, 25, 0.98) 60%,
    rgba(0, 0, 0, 1) 100%
  )
`,
                  border: "1px solid rgba(72,202,228,0.3)",
                  borderRadius: "10px",
                  backdropFilter: "blur(12px)",
                }}
              >
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "#48CAE4", fontWeight: 600 }}
                >
                  4. Partners & Affiliates
                </h3>
                <p>
                  By accepting these terms, you consent to GLIMAD sharing
                  relevant information with our trusted partners and affiliates
                  for the following purposes:
                </p>
                <ul className="list-disc pl-5 mb-4 space-y-1">
                  <li>
                    Brand Collaborations: Connect you with local brands and
                    collaboration opportunities that match your niche and
                    location
                  </li>
                  <li>
                    Local Partnerships: Introduce you to relevant local partners
                    in your area for authentic community-based collaborations
                  </li>
                  <li>
                    Sponsored Opportunities: Inform you about sponsored content
                    opportunities from brands that align with your creative
                    identity
                  </li>
                  <li>
                    Affiliate Products: Recommend tools, software, and services
                    from our affiliate partners that can help accelerate your
                    growth
                  </li>
                  <li>
                    Strategic Collaborations: Connect you with other creators,
                    mentors, or industry professionals for potential
                    partnerships
                  </li>
                </ul>
                <p className="mb-4">
                  ✓ We only share information that is relevant to opportunities
                  that benefit your creative career. You can opt out of partner
                  communications at any time.
                </p>
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "#48CAE4", fontWeight: 600 }}
                >
                  5. Marketing & Promotional Communications
                </h3>
                <p>By accepting, you agree to receive:</p>
                <ul className="list-disc pl-5 mb-4 space-y-1">
                  <li>
                    Platform Updates: News about new features, tools, and
                    improvements to GLIMAD
                  </li>
                  <li>
                    Exclusive Offers: Early access, beta testing opportunities,
                    and special promotions
                  </li>
                  <li>
                    Partner Promotions: Relevant offers and opportunities from
                    our trusted partners and affiliates
                  </li>
                  <li>
                    Educational Content: Tips, guides, and resources to help you
                    grow your creative career
                  </li>
                  <li>
                    Feedback Requests: Surveys and research to improve the
                    GLIMAD experience
                  </li>
                </ul>
                <p className="mb-2">
                  ✓ You can unsubscribe from promotional emails at any time by
                  clicking the &quot;unsubscribe&quot; link at the bottom of any
                  email.
                </p>

                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "#48CAE4", fontWeight: 600 }}
                >
                  6. Data Sharing & Third Parties
                </h3>
                <p>We may share your data with:</p>
                <ul className="list-disc pl-5 mb-4 space-y-1">
                  <li>
                    Trusted Partners: Selected partners and affiliates who offer
                    relevant opportunities for your creative growth
                  </li>
                  <li>
                    Service Providers: Third-party services that help us operate
                    the platform (email providers, analytics tools, cloud
                    storage)
                  </li>
                  <li>
                    Aggregated Data: Anonymous, aggregated statistics with
                    partners for research and industry insights
                  </li>
                </ul>
                <p className="mb-2">
                  ✗ We will NEVER sell your personal data to third parties for
                  profit. All data sharing is done exclusively to benefit your
                  creative journey.
                </p>
              </div>
              <h3 className="text-white font-semibold text-base mb-2">
                7. Your Rights
              </h3>

              <ul className="list-disc pl-5 mb-4 space-y-1">
                <li>
                  Right to Access: Request a copy of all personal data we hold
                  about you
                </li>
                <li>
                  Right to Rectification: Correct any inaccurate or incomplete
                  data
                </li>
                <li>
                  Right to Erasure: Request deletion of your personal data
                  (&quot;right to be forgotten&quot;)
                </li>
                <li>
                  Right to Data Portability: Receive your data in a structured,
                  machine- readable format
                </li>
                <li>
                  Right to Withdraw Consent: Withdraw your consent at any time
                </li>
                <li>
                  Right to Opt-Out: Opt out of marketing communications and
                  partner sharing
                </li>
                <p className="mb-2">
                  To exercise any of these rights, contact us at{" "}
                  <a
                    href="mailto:privacy@glimad.com"
                    className="text-cyan-400 hover:underline"
                  >
                    privacy@glimad.com
                  </a>
                </p>
              </ul>

              <h3 className="text-white font-semibold text-base mb-2">
                8. Data Security
              </h3>
              <p className="mb-4">
                We implement industry-standard security measures to protect your
                personal information, including encryption, secure servers, and
                regular security audits. However, no method of transmission over
                the internet is 100% secure.
              </p>

              <h3 className="text-white font-semibold text-base mb-2">
                9. Changes to These Terms
              </h3>
              <p className="mb-4">
                We may update these Terms & Conditions from time to time. We
                will notify you of any significant changes via email. Your
                continued use of GLIMAD after changes constitutes acceptance of
                the updated terms.
              </p>
              <h3 className="text-white font-semibold text-base mb-2">
                10. Contact Us
              </h3>
              <p>
                If you have any questions or concerns about these Terms &
                Conditions or our Privacy Policy, please contact us at{" "}
                <a
                  href="mailto:privacy@glimad.com"
                  className="text-cyan-400 hover:underline"
                >
                  📧 privacy@glimad.com
                </a>
              </p>
            </div>

            {/* Accept button */}
            <div
              className="flex items-center justify-between p-4 rounded-b-2xl"
              style={{
                background: "rgba(6, 6, 7, 0.95)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                onClick={() => {
                  setFormData((prev) => ({ ...prev, gdprConsent: true }));
                  setShowTerms(false);
                }}
                className="w-full font-semibold text-white transition-opacity hover:opacity-90"
                style={{
                  background: "linear-gradient(to right, #00C9A7, #9B6BFF)",
                  borderRadius: "4px",
                  padding: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                I Understand & Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
