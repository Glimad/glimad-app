/**
 * lib/missions/ui-catalog.ts
 * Brief 11: Mission Templates UI Auto-fill Catalog
 *
 * Maps each template_code to:
 *  - UI field definitions (type, label, how to populate from LLM output)
 *  - Brain patch definitions (what facts to write on user approval)
 *  - Display metadata (title, subtitle, icon)
 */

// ============================================================================
// TYPES
// ============================================================================

export type UIFieldType =
  | "text" // single-line text input
  | "textarea" // multi-line text input
  | "tag_list" // editable list of tags/chips
  | "badge" // read-only badge display
  | "score_bar" // 0-100 progress bar (read-only)
  | "list_info" // read-only bullet list
  | "list_warning" // read-only warning list
  | "list_success" // read-only success list
  | "radar" // radar chart (read-only, visualization)
  | "readonly_text"; // read-only text block

export interface UIField {
  id: string; // maps to LLM output key AND brain patch key
  type: UIFieldType;
  label: string;
  subtitle?: string;
  llm_key: string; // key in the LLM output JSON to pre-fill from
  editable: boolean;
  required?: boolean;
  min_items?: number; // for tag_list
  max_items?: number; // for tag_list
  max_length?: number; // for text/textarea
  placeholder?: string;
}

export interface UISection {
  id: string;
  title: string;
  subtitle?: string;
  fields: UIField[];
}

export interface BrainPatch {
  fact_key: string; // key to write to brain_facts
  value_source: string; // field id whose approved value to use
}

export interface UIConfig {
  template_code: string;
  display_name: string;
  display_subtitle: string;
  icon: string;
  review_title: string; // heading on the review/autofill section
  review_subtitle: string; // sub-heading
  sections: UISection[];
  brain_patches: BrainPatch[];
  cta_approve: string; // button text for approval
  cta_skip: string; // button text to skip/pass
}

// ============================================================================
// UI CATALOG
// ============================================================================

const UI_CATALOG: Record<string, UIConfig> = {
  // --------------------------------------------------------------------------
  // CONTENT BATCH MISSIONS (execution)
  // --------------------------------------------------------------------------

  content_batch_3d: {
    template_code: "content_batch_3d",
    display_name: "Quick Content Batch",
    display_subtitle: "3-day content sprint",
    icon: "✍️",
    review_title: "Review your content batch",
    review_subtitle: "Edit any piece before adding it to your calendar",
    sections: [
      {
        id: "content_pieces",
        title: "Generated content",
        fields: [
          {
            id: "posts",
            type: "list_info",
            label: "Content pieces",
            llm_key: "posts",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Add to calendar",
    cta_skip: "Skip for now",
  },

  content_batch_7d: {
    template_code: "content_batch_7d",
    display_name: "Weekly Content Batch",
    display_subtitle: "7-day content plan",
    icon: "📅",
    review_title: "Review your weekly content",
    review_subtitle: "Edit pieces and approve to add to calendar",
    sections: [
      {
        id: "content_pieces",
        title: "Generated content",
        fields: [
          {
            id: "posts",
            type: "list_info",
            label: "Content pieces",
            llm_key: "posts",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Add to calendar",
    cta_skip: "Skip for now",
  },

  content_batch_14d: {
    template_code: "content_batch_14d",
    display_name: "2-Week Content Batch",
    display_subtitle: "14-day content plan",
    icon: "📆",
    review_title: "Review your 2-week content",
    review_subtitle: "Edit pieces and approve to add to calendar",
    sections: [
      {
        id: "content_pieces",
        title: "Generated content",
        fields: [
          {
            id: "posts",
            type: "list_info",
            label: "Content pieces",
            llm_key: "posts",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Add to calendar",
    cta_skip: "Skip for now",
  },

  // --------------------------------------------------------------------------
  // NICHE & STRATEGY (planning)
  // --------------------------------------------------------------------------

  niche_refinement: {
    template_code: "niche_refinement",
    display_name: "Niche Refinement",
    display_subtitle: "Sharpen your positioning",
    icon: "🎯",
    review_title: "Your recommended niche",
    review_subtitle: "Review and edit before we save this to your profile",
    sections: [
      {
        id: "niche",
        title: "Your niche",
        fields: [
          {
            id: "refined_niche",
            type: "text",
            label: "Specific niche",
            subtitle: "What you focus on (be specific)",
            llm_key: "recommended_niche",
            editable: true,
            required: true,
            max_length: 80,
            placeholder: "e.g. Practical psychology for young adults 20–30",
          },
          {
            id: "positioning",
            type: "textarea",
            label: "What makes you different",
            subtitle: "Your unique angle in this niche",
            llm_key: "positioning",
            editable: true,
            max_length: 120,
            placeholder: "e.g. Psychology without jargon, with real exercises",
          },
        ],
      },
      {
        id: "role",
        title: "Your creator role",
        fields: [
          {
            id: "primary_role",
            type: "text",
            label: "How you present yourself",
            llm_key: "primary_role",
            editable: true,
            max_length: 60,
            placeholder: "e.g. Anonymous coach",
          },
        ],
      },
      {
        id: "assumptions",
        title: "AI assumptions",
        subtitle: "What Glimy assumed to generate this",
        fields: [
          {
            id: "assumptions",
            type: "list_warning",
            label: "Assumptions made",
            llm_key: "assumptions",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [
      { fact_key: "positioning", value_source: "refined_niche" },
      { fact_key: "primary_role", value_source: "primary_role" },
    ],
    cta_approve: "Save my niche",
    cta_skip: "Skip for now",
  },

  content_pillar_gen: {
    template_code: "content_pillar_gen",
    display_name: "Content Pillars",
    display_subtitle: "Define your content strategy",
    icon: "🏛️",
    review_title: "Your content pillars",
    review_subtitle: "Edit the pillars that will guide all your content",
    sections: [
      {
        id: "pillars",
        title: "Content pillars",
        fields: [
          {
            id: "content_pillars",
            type: "tag_list",
            label: "Your pillars (3–5)",
            llm_key: "content_pillars",
            editable: true,
            min_items: 3,
            max_items: 5,
          },
        ],
      },
    ],
    brain_patches: [
      { fact_key: "content_pillars", value_source: "content_pillars" },
    ],
    cta_approve: "Save pillars",
    cta_skip: "Skip for now",
  },

  strategy_recalc: {
    template_code: "strategy_recalc",
    display_name: "Strategy Recalculation",
    display_subtitle: "Update your growth strategy",
    icon: "🧭",
    review_title: "Updated strategy",
    review_subtitle: "Review your updated strategic direction",
    sections: [
      {
        id: "strategy",
        title: "Strategy recommendations",
        fields: [
          {
            id: "strategy_summary",
            type: "readonly_text",
            label: "Strategic direction",
            llm_key: "strategy_summary",
            editable: false,
          },
          {
            id: "recommended_actions",
            type: "list_success",
            label: "Recommended actions",
            llm_key: "recommended_actions",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Apply strategy",
    cta_skip: "Dismiss",
  },

  // --------------------------------------------------------------------------
  // PLANNING MISSIONS
  // --------------------------------------------------------------------------

  monetize_product_def: {
    template_code: "monetize_product_def",
    display_name: "Product Definition",
    display_subtitle: "Define your first digital product",
    icon: "💡",
    review_title: "Your product concept",
    review_subtitle: "Review and refine before saving",
    sections: [
      {
        id: "product",
        title: "Product concept",
        fields: [
          {
            id: "product_name",
            type: "text",
            label: "Product name",
            llm_key: "product_name",
            editable: true,
            max_length: 60,
            placeholder: "e.g. 30-Day Anxiety Reset",
          },
          {
            id: "product_description",
            type: "textarea",
            label: "What it is",
            llm_key: "product_description",
            editable: true,
            max_length: 200,
          },
          {
            id: "target_audience",
            type: "text",
            label: "Who it is for",
            llm_key: "target_audience",
            editable: true,
            max_length: 80,
          },
          {
            id: "suggested_price",
            type: "text",
            label: "Suggested price",
            llm_key: "suggested_price",
            editable: true,
            max_length: 20,
            placeholder: "e.g. €47",
          },
        ],
      },
    ],
    brain_patches: [
      { fact_key: "product_definition", value_source: "product_name" },
    ],
    cta_approve: "Save product idea",
    cta_skip: "Skip for now",
  },

  calendar_optimize: {
    template_code: "calendar_optimize",
    display_name: "Calendar Optimization",
    display_subtitle: "Optimal posting schedule",
    icon: "🗓️",
    review_title: "Optimized posting schedule",
    review_subtitle: "Review the suggested schedule for your calendar",
    sections: [
      {
        id: "schedule",
        title: "Recommended schedule",
        fields: [
          {
            id: "posting_frequency",
            type: "text",
            label: "Posting frequency",
            llm_key: "posting_frequency",
            editable: true,
            max_length: 40,
            placeholder: "e.g. 4x per week",
          },
          {
            id: "best_times",
            type: "list_info",
            label: "Best posting times",
            llm_key: "best_times",
            editable: false,
          },
          {
            id: "schedule_rationale",
            type: "readonly_text",
            label: "Why this schedule",
            llm_key: "schedule_rationale",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [
      { fact_key: "posting_frequency", value_source: "posting_frequency" },
    ],
    cta_approve: "Apply schedule",
    cta_skip: "Keep current",
  },

  // --------------------------------------------------------------------------
  // ANALYSIS MISSIONS
  // --------------------------------------------------------------------------

  format_audit: {
    template_code: "format_audit",
    display_name: "Format Audit",
    display_subtitle: "Find your winning content format",
    icon: "🔍",
    review_title: "Format analysis results",
    review_subtitle: "Insights from your content performance",
    sections: [
      {
        id: "winner",
        title: "Winning format",
        fields: [
          {
            id: "format_winner",
            type: "badge",
            label: "Best performing format",
            llm_key: "format_winner",
            editable: false,
          },
          {
            id: "format_rationale",
            type: "readonly_text",
            label: "Why this format works",
            llm_key: "format_rationale",
            editable: false,
          },
        ],
      },
      {
        id: "recommendations",
        title: "Recommendations",
        fields: [
          {
            id: "quick_wins",
            type: "list_success",
            label: "Quick wins",
            llm_key: "quick_wins",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [
      { fact_key: "format_winner", value_source: "format_winner" },
    ],
    cta_approve: "Save insights",
    cta_skip: "Dismiss",
  },

  audience_deep_dive: {
    template_code: "audience_deep_dive",
    display_name: "Audience Deep Dive",
    display_subtitle: "Understand your audience",
    icon: "👥",
    review_title: "Audience analysis",
    review_subtitle: "Key insights about your audience",
    sections: [
      {
        id: "profile",
        title: "Audience profile",
        fields: [
          {
            id: "audience_description",
            type: "readonly_text",
            label: "Who your audience is",
            llm_key: "audience_description",
            editable: false,
          },
          {
            id: "pain_points",
            type: "list_warning",
            label: "Pain points",
            llm_key: "pain_points",
            editable: false,
          },
          {
            id: "desires",
            type: "list_success",
            label: "Desires & goals",
            llm_key: "desires",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [
      { fact_key: "audience_profile", value_source: "audience_description" },
    ],
    cta_approve: "Save audience profile",
    cta_skip: "Dismiss",
  },

  daily_pulse: {
    template_code: "daily_pulse",
    display_name: "Daily Pulse",
    display_subtitle: "Today's performance check",
    icon: "📊",
    review_title: "Daily pulse results",
    review_subtitle: "Your performance snapshot for today",
    sections: [
      {
        id: "pulse",
        title: "Performance summary",
        fields: [
          {
            id: "summary",
            type: "readonly_text",
            label: "Summary",
            llm_key: "summary",
            editable: false,
          },
          {
            id: "highlights",
            type: "list_success",
            label: "Highlights",
            llm_key: "highlights",
            editable: false,
          },
          {
            id: "action_items",
            type: "list_info",
            label: "Action items",
            llm_key: "action_items",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Got it",
    cta_skip: "Dismiss",
  },

  weekly_review: {
    template_code: "weekly_review",
    display_name: "Weekly Review",
    display_subtitle: "Weekly performance check-in",
    icon: "📈",
    review_title: "Weekly review",
    review_subtitle: "Your progress this week",
    sections: [
      {
        id: "review",
        title: "Week summary",
        fields: [
          {
            id: "wins",
            type: "list_success",
            label: "Wins this week",
            llm_key: "wins",
            editable: false,
          },
          {
            id: "blockers",
            type: "list_warning",
            label: "Blockers to address",
            llm_key: "blockers",
            editable: false,
          },
          {
            id: "next_focus",
            type: "readonly_text",
            label: "Focus for next week",
            llm_key: "next_focus",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Got it",
    cta_skip: "Dismiss",
  },

  // --------------------------------------------------------------------------
  // DISCOVERY MISSIONS
  // --------------------------------------------------------------------------

  ask_glimy_chat: {
    template_code: "ask_glimy_chat",
    display_name: "Ask Glimy",
    display_subtitle: "Quick AI consultation",
    icon: "💬",
    review_title: "Glimy's response",
    review_subtitle: "Here's what Glimy recommends",
    sections: [
      {
        id: "response",
        title: "AI Response",
        fields: [
          {
            id: "answer",
            type: "readonly_text",
            label: "Answer",
            llm_key: "answer",
            editable: false,
          },
          {
            id: "action_items",
            type: "list_success",
            label: "Recommended actions",
            llm_key: "action_items",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Got it",
    cta_skip: "Dismiss",
  },

  scrape_light_focus: {
    template_code: "scrape_light_focus",
    display_name: "Platform Analysis",
    display_subtitle: "Light scrape of your main platform",
    icon: "🔎",
    review_title: "Platform analysis complete",
    review_subtitle: "Fresh data from your platform has been saved",
    sections: [
      {
        id: "results",
        title: "Analysis results",
        fields: [
          {
            id: "insights",
            type: "list_info",
            label: "Key insights",
            llm_key: "insights",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Got it",
    cta_skip: "Dismiss",
  },

  scrape_full_multi: {
    template_code: "scrape_full_multi",
    display_name: "Full Platform Audit",
    display_subtitle: "Deep analysis across all platforms",
    icon: "🌐",
    review_title: "Full platform audit complete",
    review_subtitle: "Multi-platform data has been saved to your brain",
    sections: [
      {
        id: "results",
        title: "Audit results",
        fields: [
          {
            id: "insights",
            type: "list_info",
            label: "Key insights",
            llm_key: "insights",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Got it",
    cta_skip: "Dismiss",
  },

  // --------------------------------------------------------------------------
  // EXECUTION MISSIONS
  // --------------------------------------------------------------------------

  repurpose_cross: {
    template_code: "repurpose_cross",
    display_name: "Cross-Platform Repurpose",
    display_subtitle: "Adapt content for other platforms",
    icon: "🔄",
    review_title: "Repurposed content",
    review_subtitle: "Review the adapted versions for each platform",
    sections: [
      {
        id: "versions",
        title: "Platform versions",
        fields: [
          {
            id: "posts",
            type: "list_info",
            label: "Adapted versions",
            llm_key: "posts",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Add to calendar",
    cta_skip: "Skip for now",
  },

  autopost_schedule: {
    template_code: "autopost_schedule",
    display_name: "Auto-Post Schedule",
    display_subtitle: "Schedule posts automatically",
    icon: "🤖",
    review_title: "Scheduling complete",
    review_subtitle: "Your posts have been sent to the scheduler",
    sections: [
      {
        id: "schedule",
        title: "Scheduled posts",
        fields: [
          {
            id: "scheduled_items",
            type: "list_info",
            label: "Posts scheduled",
            llm_key: "scheduled_items",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Done",
    cta_skip: "Dismiss",
  },

  image_gen_batch: {
    template_code: "image_gen_batch",
    display_name: "Image Generation",
    display_subtitle: "AI-generated visuals for your content",
    icon: "🎨",
    review_title: "Generated images",
    review_subtitle: "Review the generated images for your content",
    sections: [
      {
        id: "images",
        title: "Generated images",
        fields: [
          {
            id: "image_descriptions",
            type: "list_info",
            label: "Generated images",
            llm_key: "image_descriptions",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Save to library",
    cta_skip: "Discard",
  },

  video_gen_short: {
    template_code: "video_gen_short",
    display_name: "Short Video",
    display_subtitle: "AI-generated short-form video",
    icon: "🎬",
    review_title: "Generated video",
    review_subtitle: "Review your generated short-form video",
    sections: [
      {
        id: "video",
        title: "Video details",
        fields: [
          {
            id: "script",
            type: "readonly_text",
            label: "Script",
            llm_key: "script",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Save video",
    cta_skip: "Discard",
  },

  // --------------------------------------------------------------------------
  // RESCUE & GROWTH MISSIONS
  // --------------------------------------------------------------------------

  engagement_rescue: {
    template_code: "engagement_rescue",
    display_name: "Engagement Rescue",
    display_subtitle: "Emergency strategy for dropping engagement",
    icon: "🚨",
    review_title: "Rescue plan",
    review_subtitle: "Emergency actions to recover your engagement",
    sections: [
      {
        id: "diagnosis",
        title: "Diagnosis",
        fields: [
          {
            id: "root_cause",
            type: "readonly_text",
            label: "Root cause",
            llm_key: "root_cause",
            editable: false,
          },
        ],
      },
      {
        id: "actions",
        title: "Rescue actions",
        fields: [
          {
            id: "immediate_actions",
            type: "list_warning",
            label: "Immediate actions (do now)",
            llm_key: "immediate_actions",
            editable: false,
          },
          {
            id: "recovery_content",
            type: "list_success",
            label: "Recovery content ideas",
            llm_key: "recovery_content",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Start rescue plan",
    cta_skip: "Dismiss",
  },

  monetize_offer_build: {
    template_code: "monetize_offer_build",
    display_name: "Offer Builder",
    display_subtitle: "Complete sales offer package",
    icon: "💰",
    review_title: "Your offer package",
    review_subtitle: "Review your complete sales offer",
    sections: [
      {
        id: "offer",
        title: "Offer details",
        fields: [
          {
            id: "offer_headline",
            type: "text",
            label: "Headline",
            llm_key: "offer_headline",
            editable: true,
            max_length: 80,
          },
          {
            id: "offer_copy",
            type: "textarea",
            label: "Sales copy",
            llm_key: "offer_copy",
            editable: true,
            max_length: 400,
          },
          {
            id: "price_anchoring",
            type: "readonly_text",
            label: "Pricing strategy",
            llm_key: "price_anchoring",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Save offer",
    cta_skip: "Skip for now",
  },

  metrics_post_publish: {
    template_code: "metrics_post_publish",
    display_name: "Post Metrics",
    display_subtitle: "Performance data after publishing",
    icon: "📉",
    review_title: "Post performance",
    review_subtitle: "Metrics collected after your post was published",
    sections: [
      {
        id: "metrics",
        title: "Performance metrics",
        fields: [
          {
            id: "performance_summary",
            type: "readonly_text",
            label: "Summary",
            llm_key: "performance_summary",
            editable: false,
          },
          {
            id: "key_metrics",
            type: "list_info",
            label: "Key metrics",
            llm_key: "key_metrics",
            editable: false,
          },
        ],
      },
    ],
    brain_patches: [],
    cta_approve: "Got it",
    cta_skip: "Dismiss",
  },
};

// ============================================================================
// CATALOG FUNCTIONS
// ============================================================================

/**
 * Get UI config for a given template code.
 * Returns null if no config found (fallback to generic display).
 */
export function getUIConfig(templateCode: string): UIConfig | null {
  return UI_CATALOG[templateCode] ?? null;
}

/**
 * Get all template codes that have UI configs.
 */
export function listConfiguredTemplates(): string[] {
  return Object.keys(UI_CATALOG);
}

/**
 * Build the auto-fill payload for a UI config from LLM output.
 * Returns a map of field_id → pre-filled value.
 */
export function buildAutofillPayload(
  config: UIConfig,
  llmOutput: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const section of config.sections) {
    for (const field of section.fields) {
      const rawValue = llmOutput[field.llm_key];
      if (rawValue !== undefined && rawValue !== null) {
        payload[field.id] = rawValue;
      }
    }
  }

  return payload;
}

/**
 * Apply brain patches given a UI config and the user-approved values.
 * Returns the list of { fact_key, value } pairs to write to brain.
 */
export function resolveBrainPatches(
  config: UIConfig,
  approvedValues: Record<string, unknown>,
): Array<{ fact_key: string; value: unknown }> {
  return config.brain_patches
    .filter((patch) => approvedValues[patch.value_source] !== undefined)
    .map((patch) => ({
      fact_key: patch.fact_key,
      value: approvedValues[patch.value_source],
    }));
}
