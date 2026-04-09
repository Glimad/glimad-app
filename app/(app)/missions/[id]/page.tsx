"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

interface MissionStep {
  id: string;
  step_number: number;
  step_type: string;
  status: string;
  input: { config: { fields?: string[] } } | null;
  output: Record<string, unknown> | null;
}

interface MissionInstance {
  id: string;
  template_code: string;
  status: string;
  current_step: number;
  outputs: Record<string, unknown> | null;
  mission_templates: {
    name: string;
    description: string;
    type: string;
    steps_json: Array<{
      step_number: number;
      step_type: string;
      name: string;
      config: { fields?: string[] };
    }>;
  };
}

export default function MissionPage() {
  const params = useParams();
  const router = useRouter();
  const t = useT("missions");
  const instanceId = params.id as string;

  const [instance, setInstance] = useState<MissionInstance | null>(null);
  const [steps, setSteps] = useState<MissionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/missions/${instanceId}`);
      const data = await res.json();
      setInstance(data.instance);
      setSteps(data.steps);
      setLoading(false);
    }
    load();
    const interval = setInterval(async () => {
      const res = await fetch(`/api/missions/${instanceId}`);
      const data = await res.json();
      setInstance(data.instance);
      setSteps(data.steps);
      if (
        data.instance?.status === "completed" ||
        data.instance?.status === "failed"
      ) {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [instanceId]);

  async function handleSubmit() {
    setSubmitting(true);
    await fetch(`/api/missions/${instanceId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userInputs),
    });
    const res = await fetch(`/api/missions/${instanceId}`);
    const data = await res.json();
    setInstance(data.instance);
    setSteps(data.steps);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-zinc-400">{t("loading")}</div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-zinc-400">{t("not_found")}</div>
      </div>
    );
  }

  const template = instance.mission_templates;

  const waitingStep = steps.find((s) => s.status === "awaiting_input");

  const llmStepData = steps.find(
    (s) => s.step_type === "llm_text" && s.status === "completed",
  );
  const llmOutput = llmStepData?.output ?? {};

  const isCompleted = instance.status === "completed";
  const isFailed = instance.status === "failed";
  const isWaiting = instance.status === "waiting_input";
  const isRunning =
    instance.status === "running" || instance.status === "queued";

  function goToDashboard() {
    setNavigating(true);
    router.push("/dashboard");
  }

  return (
    <div className="text-white pb-12">
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <div className="mb-8">
          <button
            onClick={goToDashboard}
            disabled={navigating}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40 text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            {navigating ? t("navigating") : t("back")}
          </button>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-zinc-400 text-sm mt-1">{template.description}</p>
        </div>

        <div className="mb-6">
          {isRunning && (
            <div className="flex items-center gap-3 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-zinc-300 text-sm">{t("running")}</span>
            </div>
          )}

          {isFailed && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4">
              <p className="text-red-300 text-sm">{t("failed_msg")}</p>
            </div>
          )}

          {isCompleted && (
            <div className="bg-green-950 border border-green-800 rounded-xl p-6 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-green-300 font-semibold">
                {t("completed_title")}
              </p>
              <p className="text-zinc-400 text-sm mt-1">{t("completed_sub")}</p>
              <button
                onClick={goToDashboard}
                disabled={navigating}
                className="mt-4 px-6 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {navigating ? t("navigating") : t("go_dashboard")}
              </button>
            </div>
          )}
        </div>

        {isWaiting && llmOutput && (
          <div className="space-y-6">
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
                {t("ai_generated")}
              </h2>
              <LlmOutputDisplay output={llmOutput} />
            </div>

            {waitingStep?.input?.config.fields && (
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
                  {t("review_confirm")}
                </h2>
                <div className="space-y-4">
                  {waitingStep.input.config.fields.map((field) => (
                    <div key={field}>
                      <label className="text-xs text-zinc-500 mb-1 block capitalize">
                        {field.replace(/_/g, " ")}
                      </label>
                      <input
                        type="text"
                        value={
                          userInputs[field] ??
                          (llmOutput[field] as string) ??
                          ""
                        }
                        onChange={(e) =>
                          setUserInputs({
                            ...userInputs,
                            [field]: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                        placeholder={field.replace(/_/g, " ")}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="mt-6 w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold transition-colors"
                >
                  {submitting ? t("saving") : t("confirm_save")}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 space-y-2">
          {template.steps_json.map((step) => {
            const execStep = steps.find(
              (s) => s.step_number === step.step_number,
            );
            const isDone = execStep?.status === "completed";
            const isActive = step.step_number === instance.current_step;
            return (
              <div
                key={step.step_number}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  isDone
                    ? "opacity-50"
                    : isActive
                      ? "bg-zinc-900 border border-zinc-700"
                      : "opacity-30"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isDone
                      ? "bg-green-700 text-green-200"
                      : isActive
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {isDone ? "✓" : step.step_number}
                </div>
                <span className="text-sm text-zinc-300">{step.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LlmOutputDisplay({ output }: { output: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {Object.entries(output).map(([key, value]) => {
        if (key === "raw") return null;
        return (
          <div key={key}>
            <p className="text-xs text-zinc-500 capitalize mb-1">
              {key.replace(/_/g, " ")}
            </p>
            {Array.isArray(value) ? (
              <ul className="space-y-1">
                {(value as string[]).map((item, i) => (
                  <li
                    key={i}
                    className="text-sm text-zinc-200 flex items-start gap-2"
                  >
                    <span className="text-violet-400 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : typeof value === "object" && value !== null ? (
              <pre className="text-xs text-zinc-300 bg-zinc-800 rounded p-2 overflow-auto">
                {JSON.stringify(value, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-zinc-200">{String(value)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
