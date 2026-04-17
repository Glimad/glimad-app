"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import type { UIConfig, UIField } from "@/lib/missions/ui-catalog";

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
  const [uiConfig, setUiConfig] = useState<UIConfig | null>(null);
  const [autofillPayload, setAutofillPayload] = useState<
    Record<string, unknown>
  >({});
  const [userInputs, setUserInputs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);

  async function loadData() {
    const res = await fetch(`/api/missions/${instanceId}`);
    const data = await res.json();
    setInstance(data.instance);
    setSteps(data.steps ?? []);
    if (data.uiConfig) {
      setUiConfig(data.uiConfig as UIConfig);
      const af = (data.autofillPayload ?? {}) as Record<string, unknown>;
      setAutofillPayload(af);
      // Pre-fill editable fields from autofill only if not yet edited
      const defaults: Record<string, unknown> = {};
      for (const section of (data.uiConfig as UIConfig).sections) {
        for (const field of section.fields) {
          if (field.editable && af[field.id] !== undefined) {
            defaults[field.id] = af[field.id];
          }
        }
      }
      setUserInputs((prev) =>
        Object.keys(prev).length === 0 ? defaults : prev,
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      const res = await fetch(`/api/missions/${instanceId}`);
      const data = await res.json();
      setInstance(data.instance);
      setSteps(data.steps ?? []);
      if (
        data.instance?.status === "completed" ||
        data.instance?.status === "failed"
      ) {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  async function handleSubmit() {
    setSubmitting(true);
    const payload = { ...autofillPayload, ...userInputs };
    await fetch(`/api/missions/${instanceId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await loadData();
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
  const llmOutput = (llmStepData?.output ?? {}) as Record<string, unknown>;
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
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={goToDashboard}
            disabled={navigating}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40 text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            {navigating ? t("navigating") : t("back")}
          </button>
          <div className="flex items-center gap-3 mb-1">
            {uiConfig && <span className="text-2xl">{uiConfig.icon}</span>}
            <h1 className="text-2xl font-bold">{template.name}</h1>
          </div>
          <p className="text-zinc-400 text-sm mt-1">{template.description}</p>
        </div>

        {/* Status banners */}
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

        {/* Waiting — smart UI catalog render */}
        {isWaiting && (
          <div className="space-y-6">
            {uiConfig ? (
              <SmartMissionReview
                uiConfig={uiConfig}
                autofillPayload={autofillPayload}
                userInputs={userInputs}
                setUserInputs={setUserInputs}
                onApprove={handleSubmit}
                submitting={submitting}
              />
            ) : (
              <FallbackReview
                llmOutput={llmOutput}
                waitingStep={waitingStep}
                userInputs={userInputs as Record<string, string>}
                setUserInputs={(v) => setUserInputs(v)}
                onApprove={handleSubmit}
                submitting={submitting}
                t={t}
              />
            )}
          </div>
        )}

        {/* Step tracker */}
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

// ============================================================================
// SMART MISSION REVIEW (uses UI catalog)
// ============================================================================

function SmartMissionReview({
  uiConfig,
  autofillPayload,
  userInputs,
  setUserInputs,
  onApprove,
  submitting,
}: {
  uiConfig: UIConfig;
  autofillPayload: Record<string, unknown>;
  userInputs: Record<string, unknown>;
  setUserInputs: (v: Record<string, unknown>) => void;
  onApprove: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="text-base font-semibold text-white mb-1">
          {uiConfig.review_title}
        </h2>
        <p className="text-zinc-400 text-sm">{uiConfig.review_subtitle}</p>
      </div>

      {uiConfig.sections.map((section) => (
        <div
          key={section.id}
          className="bg-zinc-900 rounded-xl p-5 border border-zinc-800"
        >
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
            {section.title}
          </h3>
          {section.subtitle && (
            <p className="text-xs text-zinc-500 mb-4">{section.subtitle}</p>
          )}
          <div className="space-y-4">
            {section.fields.map((field) => (
              <UIFieldRenderer
                key={field.id}
                field={field}
                value={
                  field.editable
                    ? (userInputs[field.id] ?? autofillPayload[field.id])
                    : (autofillPayload[field.id] ?? null)
                }
                onChange={(val) =>
                  setUserInputs({ ...userInputs, [field.id]: val })
                }
              />
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={onApprove}
        disabled={submitting}
        className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-40"
        style={{
          background: "linear-gradient(to right, #7C3AED, #9B6BFF)",
          fontSize: "15px",
        }}
      >
        {submitting ? "Saving..." : uiConfig.cta_approve}
      </button>
    </div>
  );
}

// ============================================================================
// UI FIELD RENDERER
// ============================================================================

function UIFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: UIField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const strValue = value != null ? String(value) : "";
  const arrValue = Array.isArray(value) ? (value as string[]) : [];

  if (field.type === "text") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-1 block">
          {field.label}
        </label>
        {field.subtitle && (
          <p className="text-xs text-zinc-600 mb-1">{field.subtitle}</p>
        )}
        <input
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.max_length}
          placeholder={field.placeholder}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
        />
        {field.max_length && (
          <p className="text-xs text-zinc-600 mt-1 text-right">
            {strValue.length}/{field.max_length}
          </p>
        )}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-1 block">
          {field.label}
        </label>
        {field.subtitle && (
          <p className="text-xs text-zinc-600 mb-1">{field.subtitle}</p>
        )}
        <textarea
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.max_length}
          placeholder={field.placeholder}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors resize-none"
        />
        {field.max_length && (
          <p className="text-xs text-zinc-600 mt-1 text-right">
            {strValue.length}/{field.max_length}
          </p>
        )}
      </div>
    );
  }

  if (field.type === "tag_list") {
    return <TagListField field={field} value={arrValue} onChange={onChange} />;
  }

  if (field.type === "badge") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-1 block">
          {field.label}
        </label>
        <span
          className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
          style={{
            background: "rgba(0,201,167,0.15)",
            border: "1px solid rgba(0,201,167,0.4)",
            color: "#00C9A7",
          }}
        >
          {strValue || "—"}
        </span>
      </div>
    );
  }

  if (field.type === "readonly_text") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-1 block">
          {field.label}
        </label>
        <p className="text-sm text-zinc-200 leading-relaxed">
          {strValue || <span className="text-zinc-600 italic">No data</span>}
        </p>
      </div>
    );
  }

  if (field.type === "list_info") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-2 block">
          {field.label}
        </label>
        <ul className="space-y-1.5">
          {arrValue.length > 0 ? (
            arrValue.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-zinc-200"
              >
                <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                <span>
                  {typeof item === "object" ? JSON.stringify(item) : item}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-zinc-600 italic">No data</li>
          )}
        </ul>
      </div>
    );
  }

  if (field.type === "list_warning") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-2 block">
          {field.label}
        </label>
        <ul className="space-y-1.5">
          {arrValue.length > 0 ? (
            arrValue.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-amber-200"
              >
                <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
                <span>
                  {typeof item === "object" ? JSON.stringify(item) : item}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-zinc-600 italic">None</li>
          )}
        </ul>
      </div>
    );
  }

  if (field.type === "list_success") {
    return (
      <div>
        <label className="text-xs text-zinc-500 mb-2 block">
          {field.label}
        </label>
        <ul className="space-y-1.5">
          {arrValue.length > 0 ? (
            arrValue.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-green-200"
              >
                <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                <span>
                  {typeof item === "object" ? JSON.stringify(item) : item}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-zinc-600 italic">None</li>
          )}
        </ul>
      </div>
    );
  }

  if (field.type === "score_bar") {
    const score = typeof value === "number" ? value : 0;
    return (
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-xs text-zinc-500">{field.label}</label>
          <span className="text-xs text-zinc-400 font-medium">{score}/100</span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${score}%`,
              background:
                score >= 70 ? "#00C9A7" : score >= 40 ? "#9B6BFF" : "#FF6B9D",
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}

function TagListField({
  field,
  value,
  onChange,
}: {
  field: UIField;
  value: string[];
  onChange: (val: unknown) => void;
}) {
  const [newTag, setNewTag] = useState("");
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{field.label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag, i) => (
          <span
            key={i}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium"
            style={{
              background: "rgba(124,58,237,0.2)",
              border: "1px solid rgba(124,58,237,0.4)",
              color: "#c4b5fd",
            }}
          >
            {tag}
            {field.editable && (
              <button
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                className="ml-1 text-zinc-400 hover:text-white text-xs"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {field.editable &&
        (!field.max_items || value.length < field.max_items) && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  onChange([...value, newTag.trim()]);
                  setNewTag("");
                }
              }}
              placeholder="Add item and press Enter"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={() => {
                if (newTag.trim()) {
                  onChange([...value, newTag.trim()]);
                  setNewTag("");
                }
              }}
              className="px-3 py-2 rounded-lg text-sm text-violet-400 border border-violet-700 hover:border-violet-500 transition-colors"
            >
              Add
            </button>
          </div>
        )}
      {field.min_items && value.length < field.min_items && (
        <p className="text-xs text-amber-500 mt-1">
          Add at least {field.min_items} items
        </p>
      )}
    </div>
  );
}

// ============================================================================
// FALLBACK REVIEW (generic, for templates without UI catalog config)
// ============================================================================

function FallbackReview({
  llmOutput,
  waitingStep,
  userInputs,
  setUserInputs,
  onApprove,
  submitting,
  t,
}: {
  llmOutput: Record<string, unknown>;
  waitingStep: MissionStep | undefined;
  userInputs: Record<string, string>;
  setUserInputs: (v: Record<string, string>) => void;
  onApprove: () => void;
  submitting: boolean;
  t: (key: string) => string;
}) {
  return (
    <>
      {Object.keys(llmOutput).length > 0 && (
        <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            {t("ai_generated")}
          </h2>
          <LlmOutputDisplay output={llmOutput} />
        </div>
      )}
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
                    userInputs[field] ?? (llmOutput[field] as string) ?? ""
                  }
                  onChange={(e) =>
                    setUserInputs({ ...userInputs, [field]: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  placeholder={field.replace(/_/g, " ")}
                />
              </div>
            ))}
          </div>
          <button
            onClick={onApprove}
            disabled={submitting}
            className="mt-6 w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold transition-colors"
          >
            {submitting ? t("saving") : t("confirm_save")}
          </button>
        </div>
      )}
    </>
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
