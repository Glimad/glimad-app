// Prompt library for mission LLM steps
// Each prompt takes brain context and returns a structured instruction for Claude

export type PromptKey =
  | 'VISION_PURPOSE_V1'
  | 'NICHE_CONFIRM_V1'
  | 'PLATFORM_STRATEGY_V1'
  | 'PREFERENCES_CAPTURE_V1'
  | 'CONTENT_BATCH_3D_V1'
  | 'ENGAGEMENT_RESCUE_V1'
  | 'DEFINE_OFFER_V1'
  | 'AUDIENCE_PERSONA_V1'
  | 'BATCH_CONFIG_V1'
  | 'BRAND_KIT_LITE_V1'

export function buildPrompt(key: PromptKey, context: Record<string, unknown>): string {
  switch (key) {
    case 'VISION_PURPOSE_V1':
      return `You are Glimy, an AI creative strategist for content creators.

Based on the creator's onboarding answers, generate their creative vision statement, purpose, and 3 content referents.

Creator context:
- Niche/interests: ${context.niche_raw ?? 'not specified'}
- 90-day goal: ${context.primary_goal ?? 'not specified'}
- Main blocker: ${context.main_blocker ?? 'not specified'}
- Camera comfort: ${context.on_camera_comfort ?? 'not specified'}

Return a JSON object with this exact structure:
{
  "vision_statement": "A 1-2 sentence inspiring vision for their content journey",
  "creative_purpose": "Why they create and who they serve (1 sentence)",
  "referents": ["Creator/brand referent 1", "Creator/brand referent 2", "Creator/brand referent 3"],
  "key_message": "The core message they should communicate in their content"
}

Be specific to their niche. Make it inspiring but realistic. Use the language of their niche.`

    case 'NICHE_CONFIRM_V1':
      return `You are Glimy, an AI creative strategist for content creators.

Based on the creator's interests and goals, help them define a sharp, differentiated niche.

Creator context:
- Raw interests: ${context.niche_raw ?? 'not specified'}
- 90-day goal: ${context.primary_goal ?? 'not specified'}
- Current platforms: ${Array.isArray(context.current_platforms) ? (context.current_platforms as string[]).join(', ') : 'none'}

Return a JSON object with this exact structure:
{
  "niche": "The refined niche in 5-8 words (specific + differentiated)",
  "audience_persona": "Who is their ideal audience: age, interests, pain points (2-3 sentences)",
  "positioning": "What makes them unique vs others in this niche (1 sentence)",
  "content_pillars": ["Pillar 1", "Pillar 2", "Pillar 3"]
}

Make the niche specific enough to stand out but broad enough to sustain content long-term.`

    case 'PLATFORM_STRATEGY_V1':
      return `You are Glimy, an AI creative strategist for content creators.

Based on the creator's profile, recommend their focus platform and publishing strategy.

Creator context:
- Niche: ${context.niche_raw ?? 'not specified'}
- Current platforms: ${Array.isArray(context.current_platforms) ? (context.current_platforms as string[]).join(', ') : 'none'}
- Weekly hours available: ${context.hours_per_week ?? 'unknown'}
- Camera comfort: ${context.on_camera_comfort ?? 'not specified'}

Return a JSON object with this exact structure:
{
  "focus_platform": "One of: instagram, tiktok, youtube, spotify, twitter",
  "posting_frequency": "e.g. 3x per week",
  "content_formats": ["Format 1", "Format 2", "Format 3"],
  "rationale": "Why this platform fits their profile best (2-3 sentences)",
  "satellite_platforms": ["platform1", "platform2"]
}

Choose the platform that best matches their content type, available time, and camera comfort.`

    case 'PREFERENCES_CAPTURE_V1':
      return `You are Glimy, an AI creative strategist for content creators.

Based on the creator's profile, suggest creative workflow preferences that will help them publish consistently.

Creator context:
- Platform: ${context.focus_platform ?? 'not selected yet'}
- Weekly hours: ${context.hours_per_week ?? 'unknown'}
- Camera comfort: ${context.on_camera_comfort ?? 'not specified'}

Return a JSON object with this exact structure:
{
  "content_formats": ["Best format 1 for their platform", "Best format 2", "Best format 3"],
  "best_posting_times": ["Day Time (e.g. Monday 18:00)", "Day Time", "Day Time"],
  "energy_level": "low | medium | high — how intensive their content workflow should be",
  "batch_preference": "single | batch_3d | batch_7d — how they prefer to create content",
  "collaboration_style": "solo | collaborative",
  "advice": "One key piece of advice to help them stay consistent (1-2 sentences)"
}

Tailor everything to their available time and energy level.`

    case 'CONTENT_BATCH_3D_V1':
      return `You are Glimy, an AI creative strategist for content creators.

Generate a 3-day content plan with scripts/hooks for each post.

Creator context:
- Niche: ${context.niche ?? context.niche_raw ?? 'not specified'}
- Platform: ${context.focus_platform ?? 'not specified'}
- Audience: ${context.audience_persona ?? 'not specified'}
- Brand kit: ${context.brand_kit ? JSON.stringify(context.brand_kit) : 'not defined yet'}

Return a JSON object with this exact structure:
{
  "posts": [
    {
      "day": 1,
      "format": "reel | carousel | post | story",
      "hook": "Opening hook (first 3 seconds/words)",
      "title": "Content title",
      "script_outline": "3-5 key talking points or carousel slides",
      "cta": "Call to action",
      "hashtags": ["hashtag1", "hashtag2"]
    }
  ]
}

Include exactly 3 posts. Make hooks attention-grabbing. Vary formats across days.`

    case 'ENGAGEMENT_RESCUE_V1':
      return `You are Glimy, an AI creative strategist for content creators.

The creator's engagement is in decline. Create an action plan to recover it.

Creator context:
- Platform: ${context.focus_platform ?? 'not specified'}
- Current engagement rate: ${context.avg_engagement_rate ?? 'unknown'}
- Followers: ${context.followers_total ?? 'unknown'}

Return a JSON object with this exact structure:
{
  "diagnosis": "Why engagement is likely declining (1-2 sentences based on common patterns)",
  "actions": [
    {
      "priority": "high | medium | low",
      "action": "Specific action to take",
      "rationale": "Why this will help",
      "timeframe": "e.g. This week"
    }
  ],
  "quick_win": "One thing they can do TODAY to see results",
  "content_hook": "A specific high-engagement hook idea for their niche"
}

Include 3-5 actions. Be specific and actionable.`

    case 'DEFINE_OFFER_V1':
      return `You are Glimy, an AI creative strategist for content creators.

Help the creator define their first monetizable offer.

Creator context:
- Niche: ${context.niche ?? context.niche_raw ?? 'not specified'}
- Audience: ${context.audience_persona ?? 'not specified'}
- Platform: ${context.focus_platform ?? 'not specified'}
- Followers: ${context.followers_total ?? 'unknown'}

Return a JSON object with this exact structure:
{
  "offer_title": "Name of the offer (product/service/course/etc)",
  "offer_type": "digital_product | service | community | sponsorship | course",
  "offer_price": "Suggested price range in EUR",
  "offer_audience": "Who specifically this is for",
  "offer_cta": "The exact CTA to use in content",
  "value_proposition": "What transformation/result the buyer gets (1-2 sentences)",
  "launch_steps": ["Step 1", "Step 2", "Step 3"]
}

Make the offer realistic for their current audience size and niche.`

    case 'AUDIENCE_PERSONA_V1':
      return `You are Glimy, the audience specialist at GlimAd. Define a specific, actionable audience persona for this creator.

Creator context:
- Niche: ${context.niche_raw ?? context.niche ?? 'not specified'}
- 90-day goal: ${context.primary_goal ?? 'not specified'}
- Camera comfort: ${context.on_camera_comfort ?? 'not specified'}
- Platform: ${context.focus_platform ?? 'not specified'}

Return a JSON object with this exact structure:
{
  "persona_name": "A memorable fictional name for the persona",
  "demographics": {
    "age_range": "specific range e.g. 28-35",
    "gender": "male | female | non-binary | all",
    "location": "country/region",
    "occupation": "what they do",
    "income_level": "low | medium | high | mixed"
  },
  "psychographics": {
    "values": ["value1", "value2"],
    "lifestyle": "how they live and work",
    "content_consumption_habits": "when and how they consume content"
  },
  "pain_points": [
    { "pain": "specific problem they face", "severity": "high | medium | low" }
  ],
  "goals_aspirations": ["what they want to achieve"],
  "language_style": {
    "tone": "formal | casual | technical | aspirational",
    "keywords_they_use": ["keyword1", "keyword2"],
    "phrases_they_say": ["phrase1", "phrase2"]
  },
  "best_times_to_reach": ["Morning 7-9am", "Evening 9-11pm"]
}

Include 3-5 pain points. Be hyper-specific to their niche — no generic personas.`

    case 'BATCH_CONFIG_V1':
      return `You are Glimy, the content rhythm specialist at GlimAd. Help this creator define a sustainable content publishing schedule.

Creator context:
- Platform: ${context.focus_platform ?? 'not specified'}
- Weekly hours available: ${context.hours_per_week ?? 'unknown'}
- Audience persona: ${context.audience_persona ? JSON.stringify(context.audience_persona).slice(0, 200) : 'not defined yet'}

Return a JSON object with this exact structure:
{
  "posts_per_week": 3,
  "batch_size": 3,
  "batches_per_month": 4,
  "creation_days": ["Monday", "Thursday"],
  "hours_per_batch": 2,
  "best_posting_times": ["Tuesday 18:00", "Thursday 18:00", "Saturday 12:00"],
  "formats_rotation": ["Reel", "Carousel", "Story"],
  "rationale": "Why this schedule fits their available time and platform algorithm (2 sentences)"
}

Do NOT recommend impossible schedules. Match frequency to their available hours. Factor in platform-specific best practices.`

    case 'BRAND_KIT_LITE_V1':
      return `You are Glimy, the brand designer at GlimAd. Create a lightweight brand kit for this creator's content consistency.

Creator context:
- Niche: ${context.niche_raw ?? context.niche ?? 'not specified'}
- Platform: ${context.focus_platform ?? 'not specified'}
- Audience persona: ${context.audience_persona ? JSON.stringify(context.audience_persona).slice(0, 200) : 'not defined yet'}
- Vision: ${context.vision_statement ?? 'not defined yet'}

Return a JSON object with this exact structure:
{
  "brand_name": "Creator's brand name or handle concept",
  "tone_of_voice": "How they should sound: e.g. 'Educational but approachable, like a knowledgeable friend'",
  "content_pillars": ["Pillar 1", "Pillar 2", "Pillar 3"],
  "color_palette": {
    "primary": "color description (e.g. Deep violet #6B46C1)",
    "secondary": "color description",
    "accent": "color description",
    "background": "color description"
  },
  "visual_style": "Description of their visual aesthetic (2-3 sentences)",
  "caption_formula": "Template for captions: e.g. Hook + Value + CTA",
  "hashtag_strategy": {
    "niche_tags": ["#tag1", "#tag2"],
    "broad_tags": ["#tag3", "#tag4"],
    "branded_tags": ["#personaltag"]
  },
  "dos": ["Do this in content"],
  "donts": ["Avoid this in content"]
}

Make the brand kit specific to their niche and platform. Colors should reflect their content mood.`

    default:
      return `Analyze the creator's situation and provide strategic recommendations. Return a JSON object with your analysis.`
  }
}
