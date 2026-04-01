import { z } from 'zod'
import type { PromptKey } from './prompts'

const VisionPurposeSchema = z.object({
  vision_statement: z.string(),
  creative_purpose: z.string(),
  referents: z.array(z.string()),
  key_message: z.string(),
})

const NicheConfirmSchema = z.object({
  niche: z.string(),
  audience_persona: z.string(),
  positioning: z.string(),
  content_pillars: z.array(z.string()),
})

const PlatformStrategySchema = z.object({
  focus_platform: z.string(),
  posting_frequency: z.string(),
  content_formats: z.array(z.string()),
  rationale: z.string(),
  satellite_platforms: z.array(z.string()),
})

const PreferencesCaptureSchema = z.object({
  content_formats: z.array(z.string()),
  best_posting_times: z.array(z.string()),
  energy_level: z.string(),
  batch_preference: z.string(),
  collaboration_style: z.string(),
  advice: z.string(),
})

const ContentBatch3dSchema = z.object({
  posts: z.array(z.object({
    day: z.number(),
    format: z.string(),
    hook: z.string(),
    title: z.string(),
    script_outline: z.string(),
    cta: z.string(),
    hashtags: z.array(z.string()),
  })),
})

const EngagementRescueSchema = z.object({
  diagnosis: z.string(),
  actions: z.array(z.object({
    priority: z.string(),
    action: z.string(),
    rationale: z.string(),
    timeframe: z.string(),
  })),
  quick_win: z.string(),
  content_hook: z.string(),
})

const DefineOfferSchema = z.object({
  offer_title: z.string(),
  offer_type: z.string(),
  offer_price: z.string(),
  offer_audience: z.string(),
  offer_cta: z.string(),
  value_proposition: z.string(),
  launch_steps: z.array(z.string()),
})

const AudiencePersonaSchema = z.object({
  persona_name: z.string(),
  demographics: z.object({
    age_range: z.string(),
    gender: z.string(),
    location: z.string(),
    occupation: z.string(),
    income_level: z.string(),
  }),
  psychographics: z.object({
    values: z.array(z.string()),
    lifestyle: z.string(),
    content_consumption_habits: z.string(),
  }),
  pain_points: z.array(z.object({
    pain: z.string(),
    severity: z.string(),
  })),
  goals_aspirations: z.array(z.string()),
  language_style: z.object({
    tone: z.string(),
    keywords_they_use: z.array(z.string()),
    phrases_they_say: z.array(z.string()),
  }),
  best_times_to_reach: z.array(z.string()),
})

const BatchConfigSchema = z.object({
  posts_per_week: z.number(),
  batch_size: z.number(),
  batches_per_month: z.number(),
  creation_days: z.array(z.string()),
  hours_per_batch: z.number(),
  best_posting_times: z.array(z.string()),
  formats_rotation: z.array(z.string()),
  rationale: z.string(),
})

const BrandKitLiteSchema = z.object({
  brand_name: z.string(),
  tone_of_voice: z.string(),
  content_pillars: z.array(z.string()),
  color_palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
  }),
  visual_style: z.string(),
  caption_formula: z.string(),
  hashtag_strategy: z.object({
    niche_tags: z.array(z.string()),
    broad_tags: z.array(z.string()),
    branded_tags: z.array(z.string()),
  }),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
})

export const PROMPT_SCHEMAS: Record<PromptKey, z.ZodTypeAny> = {
  VISION_PURPOSE_V1: VisionPurposeSchema,
  NICHE_CONFIRM_V1: NicheConfirmSchema,
  PLATFORM_STRATEGY_V1: PlatformStrategySchema,
  PREFERENCES_CAPTURE_V1: PreferencesCaptureSchema,
  CONTENT_BATCH_3D_V1: ContentBatch3dSchema,
  ENGAGEMENT_RESCUE_V1: EngagementRescueSchema,
  DEFINE_OFFER_V1: DefineOfferSchema,
  AUDIENCE_PERSONA_V1: AudiencePersonaSchema,
  BATCH_CONFIG_V1: BatchConfigSchema,
  BRAND_KIT_LITE_V1: BrandKitLiteSchema,
}
