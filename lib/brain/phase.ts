// Initial phase computation from onboarding facts only.
// Full Phase Engine (Step 6) uses scraped metrics + signals.
// Here we compute a cold-start phase from what we know at signup.

export type PhaseCode = 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7'

const PLATFORM_NONE_VALUES = ['ninguna por ahora', 'none', 'no platforms yet']

export function computeInitialPhase(facts: Record<string, unknown>): PhaseCode {
  const platforms = facts['current_platforms']
  const hoursRaw = facts['hours_per_week']

  // If user has no platform yet → pure seed state
  const hasPlatform =
    platforms !== null &&
    platforms !== undefined &&
    !PLATFORM_NONE_VALUES.includes(String(platforms).toLowerCase())

  if (!hasPlatform) return 'F0'

  // Has a platform but no metrics yet → Setup
  // Time budget of 3h+ per week indicates readiness to post consistently
  const hours = parseHoursPerWeek(String(hoursRaw ?? ''))
  if (hours >= 3) return 'F1'

  return 'F0'
}

function parseHoursPerWeek(raw: string): number {
  const lower = raw.toLowerCase()
  if (lower.includes('menos de 1') || lower.includes('less than 1')) return 0.5
  if (lower.includes('1-2') || lower.includes('1–2')) return 1.5
  if (lower.includes('3-5') || lower.includes('3–5')) return 4
  if (lower.includes('6-10') || lower.includes('6–10')) return 8
  if (lower.includes('más de 10') || lower.includes('more than 10')) return 12
  return 0
}
