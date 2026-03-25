export type QuestionType = 'multi_select' | 'text' | 'select'

export interface Question {
  key: string
  type: QuestionType
}

export const ONBOARDING_QUESTIONS: Question[] = [
  { key: 'interests', type: 'multi_select' },
  { key: 'goal_90d', type: 'text' },
  { key: 'blocker_1', type: 'select' },
  { key: 'face_pref', type: 'select' },
  { key: 'time_budget_week', type: 'select' },
  { key: 'platform_current', type: 'select' },
]

export const TOTAL_STEPS = ONBOARDING_QUESTIONS.length

// platform_current value that means Flow A (no presence)
export const FLOW_A_VALUE = 'Ninguna por ahora'
export const FLOW_A_VALUE_EN = 'None yet'
