/**
 * lib/assets/schemas.ts
 * Brief 12: Output Schemas for all content asset types
 *
 * Zod schemas that validate content before it is persisted to core_assets/core_outputs.
 * Every content type has a strict contract — no unvalidated data enters the DB.
 */

import { z } from "zod";

// ============================================================================
// BASE SCHEMA (shared fields across all types)
// ============================================================================

export const BaseContentSchema = z.object({
  hook: z.string().min(1).max(300),
  caption: z.string().min(1).max(5000),
  cta: z.string().max(200).optional(),
  hashtags: z.array(z.string()).max(30).optional().default([]),
  platform: z.string().optional(),
  language: z.string().default("es"),
});

// ============================================================================
// TEXT POST
// ============================================================================

export const TextPostSchema = BaseContentSchema.extend({
  content_type: z.literal("text_post"),
  body: z.string().min(10).max(2200),
  image_prompt: z.string().max(500).optional(),
});
export type TextPost = z.infer<typeof TextPostSchema>;

// ============================================================================
// REEL / SHORT VIDEO SCRIPT
// ============================================================================

export const ReelScriptSchema = z.object({
  content_type: z.literal("reel_script"),
  hook: z.string().min(1).max(150),
  script: z
    .array(
      z.object({
        second: z.number().int().min(0),
        action: z.string().min(1).max(500),
        text_overlay: z.string().max(200).optional(),
        voiceover: z.string().max(500).optional(),
      }),
    )
    .min(1),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30).optional().default([]),
  music_suggestion: z.string().max(200).optional(),
  duration_seconds: z.number().int().min(5).max(180),
  platform: z.string().optional(),
  language: z.string().default("es"),
});
export type ReelScript = z.infer<typeof ReelScriptSchema>;

// ============================================================================
// CAROUSEL
// ============================================================================

export const CarouselSchema = z.object({
  content_type: z.literal("carousel"),
  hook: z.string().min(1).max(300),
  slides: z
    .array(
      z.object({
        slide_number: z.number().int().min(1),
        headline: z.string().min(1).max(150),
        body: z.string().max(400).optional(),
        image_prompt: z.string().max(500).optional(),
      }),
    )
    .min(2)
    .max(20),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30).optional().default([]),
  cta: z.string().max(200).optional(),
  platform: z.string().optional(),
  language: z.string().default("es"),
});
export type Carousel = z.infer<typeof CarouselSchema>;

// ============================================================================
// STORY (IG / WhatsApp / TikTok)
// ============================================================================

export const StorySchema = z.object({
  content_type: z.literal("story"),
  frames: z
    .array(
      z.object({
        frame_number: z.number().int().min(1),
        text: z.string().max(200),
        image_prompt: z.string().max(500).optional(),
        duration_seconds: z.number().int().min(1).max(60).optional(),
      }),
    )
    .min(1)
    .max(20),
  caption: z.string().max(500).optional(),
  platform: z.string().optional(),
  language: z.string().default("es"),
});
export type Story = z.infer<typeof StorySchema>;

// ============================================================================
// THREAD (X / LinkedIn)
// ============================================================================

export const ThreadSchema = z.object({
  content_type: z.literal("thread"),
  hook: z.string().min(1).max(280),
  tweets: z
    .array(
      z.object({
        position: z.number().int().min(1),
        text: z.string().min(1).max(280),
        image_prompt: z.string().max(500).optional(),
      }),
    )
    .min(2)
    .max(25),
  hashtags: z.array(z.string()).max(10).optional().default([]),
  platform: z.string().optional(),
  language: z.string().default("es"),
});
export type Thread = z.infer<typeof ThreadSchema>;

// ============================================================================
// NEWSLETTER / EMAIL
// ============================================================================

export const NewsletterSchema = z.object({
  content_type: z.literal("newsletter"),
  subject: z.string().min(1).max(150),
  preview_text: z.string().max(200).optional(),
  hook: z.string().min(1).max(300),
  sections: z
    .array(
      z.object({
        title: z.string().max(150),
        body: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(10),
  cta: z.string().max(300).optional(),
  cta_url: z.string().url().optional(),
  language: z.string().default("es"),
});
export type Newsletter = z.infer<typeof NewsletterSchema>;

// ============================================================================
// PODCAST NOTES / SHOW NOTES
// ============================================================================

export const PodcastNotesSchema = z.object({
  content_type: z.literal("podcast_notes"),
  episode_title: z.string().min(1).max(200),
  hook: z.string().min(1).max(300),
  key_points: z.array(z.string().min(1).max(300)).min(3).max(15),
  timestamps: z
    .array(
      z.object({
        time: z.string().max(10),
        topic: z.string().max(200),
      }),
    )
    .optional()
    .default([]),
  resources: z.array(z.string().max(300)).optional().default([]),
  show_notes: z.string().max(5000),
  language: z.string().default("es"),
});
export type PodcastNotes = z.infer<typeof PodcastNotesSchema>;

// ============================================================================
// VIDEO SCRIPT (YouTube long-form)
// ============================================================================

export const VideoScriptSchema = z.object({
  content_type: z.literal("video_script"),
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(300),
  outline: z
    .array(
      z.object({
        section: z.string().min(1).max(100),
        duration_minutes: z.number().min(0.5).max(30),
        script: z.string().min(1).max(3000),
        b_roll_notes: z.string().max(500).optional(),
      }),
    )
    .min(2)
    .max(20),
  outro_cta: z.string().max(300).optional(),
  thumbnail_concept: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(15).optional().default([]),
  estimated_duration_minutes: z.number().min(1).max(120),
  language: z.string().default("es"),
});
export type VideoScript = z.infer<typeof VideoScriptSchema>;

// ============================================================================
// BATCH ITEM (output from content_batch_* missions)
// ============================================================================

export const BatchItemSchema = z.object({
  content_type: z.literal("batch_item"),
  day: z.union([z.string(), z.number()]).optional(),
  format: z.string().min(1),
  hook: z.string().min(1).max(300),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30).optional().default([]),
  cta: z.string().max(200).optional(),
  image_prompt: z.string().max(500).optional(),
  platform: z.string().optional(),
  language: z.string().default("es"),
});
export type BatchItem = z.infer<typeof BatchItemSchema>;

// ============================================================================
// GENERIC CONTENT (fallback for unknown types)
// ============================================================================

export const GenericContentSchema = z
  .object({
    content_type: z.string(),
    hook: z.string().max(300).optional(),
    caption: z.string().max(5000).optional(),
    body: z.string().max(10000).optional(),
    platform: z.string().optional(),
    language: z.string().default("es"),
  })
  .passthrough();
export type GenericContent = z.infer<typeof GenericContentSchema>;

// ============================================================================
// UNION SCHEMA
// ============================================================================

export const ContentSchema = z.discriminatedUnion("content_type", [
  TextPostSchema,
  ReelScriptSchema,
  CarouselSchema,
  StorySchema,
  ThreadSchema,
  NewsletterSchema,
  PodcastNotesSchema,
  VideoScriptSchema,
  BatchItemSchema,
]);

export type ContentAssetData =
  | TextPost
  | ReelScript
  | Carousel
  | Story
  | Thread
  | Newsletter
  | PodcastNotes
  | VideoScript
  | BatchItem;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate content against its typed schema.
 * Falls back to GenericContentSchema if content_type is unknown.
 * Returns { success, data, error }
 */
export function validateContent(
  data: unknown,
):
  | { success: true; data: ContentAssetData }
  | { success: false; error: string } {
  const result = ContentSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  // Fallback: try generic schema
  const generic = GenericContentSchema.safeParse(data);
  if (generic.success) {
    return { success: true, data: generic.data as ContentAssetData };
  }

  return {
    success: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  };
}

/**
 * Estimate read time for text content (in seconds)
 */
export function estimateReadTime(text: string): number {
  const wordsPerMinute = 200;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil((words / wordsPerMinute) * 60);
}

/**
 * Extract a short summary/preview from any content type
 */
export function extractPreview(content: Record<string, unknown>): string {
  const hook = content["hook"];
  const caption = content["caption"];
  const subject = content["subject"];
  const title = content["episode_title"] ?? content["title"];

  const preview = hook ?? subject ?? title ?? caption ?? "";
  const str = String(preview);
  return str.length > 120 ? str.slice(0, 117) + "..." : str;
}

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  text_post: "Text Post",
  reel_script: "Reel Script",
  carousel: "Carousel",
  story: "Story",
  thread: "Thread",
  newsletter: "Newsletter",
  podcast_notes: "Podcast Notes",
  video_script: "Video Script",
  batch_item: "Content Piece",
};

export const CONTENT_TYPE_ICONS: Record<string, string> = {
  text_post: "📝",
  reel_script: "🎬",
  carousel: "🖼️",
  story: "⭕",
  thread: "🧵",
  newsletter: "📧",
  podcast_notes: "🎙️",
  video_script: "📹",
  batch_item: "✍️",
};
