// src/lib/constants.ts
//
// Single source of truth for HireIQ frontend constants. Anything that smells
// like a hardcoded enum, label list, or copy-stringy default belongs here.
// Edit values in this file — pages just import them.

import type { JobType, Currency } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Geography
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRIES = [
  { code: 'AE', label: '🇦🇪 UAE' },
  { code: 'SA', label: '🇸🇦 Saudi Arabia' },
  { code: 'BH', label: '🇧🇭 Bahrain' },
  { code: 'KW', label: '🇰🇼 Kuwait' },
  { code: 'QA', label: '🇶🇦 Qatar' },
  { code: 'OM', label: '🇴🇲 Oman' },
] as const

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  AE: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Al Ain', 'Other'],
  SA: ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Khobar', 'Dhahran', 'Tabuk', 'Abha', 'NEOM', 'Other'],
  BH: ['Manama', 'Riffa', 'Muharraq', 'Hamad Town', 'Other'],
  KW: ['Kuwait City', 'Salmiya', 'Hawalli', 'Farwaniya', 'Other'],
  QA: ['Doha', 'Al Wakrah', 'Al Khor', 'Lusail', 'Other'],
  OM: ['Muscat', 'Salalah', 'Sohar', 'Nizwa', 'Other'],
}

export const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  AE: 'AED', SA: 'SAR', BH: 'BHD', KW: 'KWD', QA: 'QAR', OM: 'OMR',
} as any  // Currency type covers GCC + USD/GBP; cast handles BHD/KWD/etc.

// ─────────────────────────────────────────────────────────────────────────────
// Job — work mode, employment type
// ─────────────────────────────────────────────────────────────────────────────
// Note: "AI screening" is implicit — every job is AI-driven. There is no UI
// toggle for it. Work Mode is purely about physical presence (where the
// person sits), so AI is NOT in this list.

export const WORK_MODES: readonly JobType[] = ['onsite', 'hybrid', 'remote'] as const

export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'temporary'] as const
export type EmploymentType = typeof EMPLOYMENT_TYPES[number]

// ─────────────────────────────────────────────────────────────────────────────
// Visa / Nationality / Notice-period labels
// ─────────────────────────────────────────────────────────────────────────────

export const VISA_REQUIREMENTS = {
  any:             { value: 'any',             label: '🌍 Open to all visas' },
  residence_visa:  { value: 'residence_visa',  label: '📋 Must have residence visa' },
  own_visa:        { value: 'own_visa',        label: '🔖 Own visa / transferable' },
  gcc_national:    { value: 'gcc_national',    label: '🏴 GCC Nationals preferred' },
  citizen_only:    { value: 'citizen_only',    label: '🇦🇪 Citizens only (Emiratization/Saudization)' },
} as const

export const NATIONALITY_PREFS = {
  any:           { value: 'any',           label: '🌍 Any nationality' },
  arab_national: { value: 'arab_national', label: '🌙 Arab nationals preferred' },
  gcc_national:  { value: 'gcc_national',  label: '🏴 GCC nationals preferred' },
  local_only:    { value: 'local_only',    label: '🇦🇪 Local nationals only' },
} as const

export const IMMEDIATE_JOIN_OPTIONS = {
  any:       { value: 'any',       label: '🌍 Any notice period' },
  immediate: { value: 'immediate', label: '⚡ Immediate (within 1–2 weeks)' },
  '30d':     { value: '30d',       label: '📅 30 days notice max' },
  '60d':     { value: '60d',       label: '📅 60 days notice max' },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Currencies (display order)
// ─────────────────────────────────────────────────────────────────────────────

export const GCC_CURRENCIES = [
  { code: 'AED', label: '🇦🇪 AED' },
  { code: 'SAR', label: '🇸🇦 SAR' },
  { code: 'BHD', label: '🇧🇭 BHD' },
  { code: 'KWD', label: '🇰🇼 KWD' },
  { code: 'QAR', label: '🇶🇦 QAR' },
  { code: 'OMR', label: '🇴🇲 OMR' },
] as const

export const INTL_CURRENCIES = [
  { code: 'USD', label: '🇺🇸 USD' },
  { code: 'GBP', label: '🇬🇧 GBP' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// AI screening — these are the ONLY hard filters allowed.
// Adding more types is a deliberate product decision, not a code task.
// ─────────────────────────────────────────────────────────────────────────────

export const AI_HARD_FILTERS = ['minExperience', 'requiredSkills'] as const
export type AiHardFilter = typeof AI_HARD_FILTERS[number]

export const AI_HARD_FILTER_META: Record<AiHardFilter, { title: string; hint: string }> = {
  minExperience: {
    title: 'Minimum experience',
    hint:  'Candidates below this are rejected before scoring',
  },
  requiredSkills: {
    title: 'Required skills',
    hint:  'Missing any of these = automatic rejection',
  },
}

// AI Recommendation thresholds (display only — actual logic lives in
// backend/shared/recommendations.ts).
export const AI_RECOMMENDATION_BANDS = [
  { min: 75, label: 'AI: Advance', verdict: 'advance', emoji: '✅', tagline: 'Strong match for this role',
    bg: '#F0FDF4', border: '#BBF7D0', fg: '#166534' },
  { min: 55, label: 'AI: Hold',    verdict: 'hold',    emoji: '⚠️', tagline: 'Borderline — review carefully',
    bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E' },
  { min: 0,  label: 'AI: Reject',  verdict: 'reject',  emoji: '❌', tagline: 'Weak match for this role',
    bg: '#FFF1F2', border: '#FECDD3', fg: '#991B1B' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Baseline question categories (mirror backend ai-service.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTION_CATEGORIES = {
  BACKGROUND_VALIDATION: 'background_validation',
  COMMITMENT:            'commitment',
  SALARY:                'salary',
} as const

export type QuestionCategory = typeof QUESTION_CATEGORIES[keyof typeof QUESTION_CATEGORIES]

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  background_validation: 'Background Validations',
  commitment:            'Commitment to the Job',
  salary:                'Salary Expectations',
}

export const QUESTION_CATEGORY_BADGE: Record<QuestionCategory, { bg: string; fg: string }> = {
  background_validation: { bg: '#E0F2FE', fg: '#075985' },
  commitment:            { bg: '#FEF3C7', fg: '#92400E' },
  salary:                { bg: '#E8F5EE', fg: '#0A3D2E' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand palette
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  GREEN_DARK:   '#0A3D2E',
  GREEN_LIGHT:  '#E8F5EE',
  GOLD:         '#C9A84C',
  GOLD_BG:      '#FDF6E3',
  GOLD_FG:      '#8B6F1A',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// JD Builder — the 5 questions asked when recruiter has no JD yet
// ─────────────────────────────────────────────────────────────────────────────

export const JD_BUILDER_QUESTIONS = [
  { key: 'jdQ1', label: 'Q1 — Daily Responsibilities *', required: true,
    placeholder: 'What will this person do every day? e.g. Prepare monthly financial reports, build financial models for project feasibility, liaise with external auditors...' },
  { key: 'jdQ2', label: 'Q2 — Essential Experience *', required: true,
    placeholder: 'What experience is non-negotiable? e.g. Minimum 5 years in financial analysis, strong IFRS knowledge, previous experience in real estate or construction...' },
  { key: 'jdQ3', label: 'Q3 — Success in 6 Months', required: false,
    placeholder: 'What does a great hire achieve in their first 6 months? e.g. Owns the monthly close process independently, has built relationships with all department heads...' },
  { key: 'jdQ4', label: 'Q4 — Team Culture', required: false,
    placeholder: 'Describe the team and working environment. e.g. Small collaborative finance team of 6, fast-paced, direct communication with CFO, hybrid working...' },
  { key: 'jdQ5', label: 'Q5 — Industry Background', required: false,
    placeholder: 'Any specific industry required? e.g. Must have GCC real estate experience, banking or financial services preferred, open to any industry...' },
] as const
