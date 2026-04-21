// Journey stage values
export const JOURNEY_STAGE_STARTING  = 'starting'
export const JOURNEY_STAGE_EXISTING  = 'existing'
export const JOURNEY_STAGE_LEGACY    = 'legacy'

// Experiment variant codes
export const VARIANT_ZERO_START  = 'A_zero_start'
export const VARIANT_HAS_PRESENCE = 'B_has_presence'
export const VARIANT_LEGACY       = 'C_legacy_builder'

// Maps frontend project-type ids (from the onboarding PROJECT_TYPES list)
// to the canonical value stored in brain_facts["identity.project_type"].
// Unmapped ids pass through unchanged.
export const PROJECT_TYPE_CANONICAL: Record<string, string> = {
  'personal-brand': 'brand/business',
}

export function normalizeProjectType(raw: string): string {
  if (!raw) return ''
  return PROJECT_TYPE_CANONICAL[raw] ?? raw
}
