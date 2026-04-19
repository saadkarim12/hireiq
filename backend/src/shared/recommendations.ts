// src/shared/recommendations.ts
// AI recommendations per pipeline transition.
// Principle: AI proposes, recruiter decides. Never auto-advance.
//
// Applied → L1 CV Screened       — recommendForL1   (CV-only: cvMatch + hardFilter)
// L1 → L2 WA Screened            — recommendForL2   (composite + commitment, post-WhatsApp)
// L2 → L3 Interviewed            — recommendForL3   (technical interview score) [stub — Phase 7]
// L3 → Final Shortlist           — recommendForFinal (culture/final interview score) [stub — Phase 7]
// Final → Hired                  — recommendForHired (offer acceptance) [stub — Phase 7]

export type Recommendation = 'advance' | 'hold' | 'reject'

export type NextStageKey =
  | 'l1_cv_screened'
  | 'l2_wa_screened'
  | 'l3_interviewed'
  | 'final_shortlist'
  | 'hired'

export interface RecommendationResult {
  recommendation: Recommendation
  reason: string
  stage: NextStageKey
}

// Maps current pipelineStage → the next-stage transition to evaluate
export const NEXT_STAGE_FOR: Record<string, NextStageKey | null> = {
  applied:      'l1_cv_screened',
  screening:    'l1_cv_screened',
  evaluated:    'l1_cv_screened',
  shortlisted:  'l2_wa_screened',
  interviewing: 'l3_interviewed',
  offered:      'final_shortlist',
  hired:        null,
  rejected:     null,
  withdrawn:    null,
  held:         null,
}

// ── Applied → L1 CV Screened ─────────────────────────────────────────────────
// CV-only signals. Commitment + salary not collected yet at this stage.
export interface L1Inputs {
  cvMatchScore: number | null
  hardFilterPass: boolean | null
  hardFilterFailReason?: string | null
  missingSkills?: string[]
}

export function recommendForL1(inputs: L1Inputs): RecommendationResult | null {
  const { cvMatchScore, hardFilterPass, hardFilterFailReason, missingSkills } = inputs

  if (cvMatchScore == null) return null

  if (hardFilterPass === false) {
    const missing = missingSkills?.length ? missingSkills.slice(0, 3).join(', ') : (hardFilterFailReason || 'requirements')
    return { recommendation: 'reject', reason: `Missing must-have: ${missing}`, stage: 'l1_cv_screened' }
  }

  if (cvMatchScore < 55) {
    return { recommendation: 'reject', reason: `CV match weak (${cvMatchScore}) — doesn't meet role requirements`, stage: 'l1_cv_screened' }
  }

  if (cvMatchScore >= 75) {
    return { recommendation: 'advance', reason: `Strong CV match (${cvMatchScore}) — ready for WhatsApp screening`, stage: 'l1_cv_screened' }
  }

  // 55–74
  return { recommendation: 'hold', reason: `Borderline CV match (${cvMatchScore}) — review carefully`, stage: 'l1_cv_screened' }
}

// ── L1 → L2 WA Screened ──────────────────────────────────────────────────────
// Post-WhatsApp: full composite + commitment quality.
export interface L2Inputs {
  compositeScore: number | null
  commitmentScore: number | null
  hardFilterPass: boolean | null
  hardFilterFailReason?: string | null
  missingSkills?: string[]
}

export function recommendForL2(inputs: L2Inputs): RecommendationResult | null {
  const { compositeScore, commitmentScore, hardFilterPass, hardFilterFailReason, missingSkills } = inputs

  if (compositeScore == null) return null

  if (hardFilterPass === false) {
    const missing = missingSkills?.length ? missingSkills.slice(0, 3).join(', ') : (hardFilterFailReason || 'requirements')
    return { recommendation: 'reject', reason: `Missing must-have: ${missing}`, stage: 'l2_wa_screened' }
  }

  if (compositeScore < 55) {
    return { recommendation: 'reject', reason: `Composite weak (${compositeScore}) — CV + screening don't meet the bar`, stage: 'l2_wa_screened' }
  }

  if (compositeScore >= 75) {
    if (commitmentScore != null && commitmentScore < 70) {
      return {
        recommendation: 'hold',
        reason: `High composite (${compositeScore}) but vague screening answers (commitment ${commitmentScore}) — worth a call`,
        stage: 'l2_wa_screened',
      }
    }
    return {
      recommendation: 'advance',
      reason: `Strong composite (${compositeScore}) + clear answers (commitment ${commitmentScore ?? '–'}) — ready for technical interview`,
      stage: 'l2_wa_screened',
    }
  }

  return {
    recommendation: 'hold',
    reason: `Borderline composite (${compositeScore}) — review carefully before interview`,
    stage: 'l2_wa_screened',
  }
}

// ── L2 → L3 Interviewed ──────────────────────────────────────────────────────
// Technical interview score drives the call. Phase 7 UI will populate interviewTechnicalScore.
export interface L3Inputs {
  interviewTechnicalScore: number | null
}

export function recommendForL3(inputs: L3Inputs): RecommendationResult | null {
  if (inputs.interviewTechnicalScore == null) return null
  const s = inputs.interviewTechnicalScore
  if (s >= 7) return { recommendation: 'advance', reason: `Strong technical interview (${s}/10)`,   stage: 'l3_interviewed' }
  if (s >= 5) return { recommendation: 'hold',    reason: `Technical interview borderline (${s}/10) — discuss`, stage: 'l3_interviewed' }
  return { recommendation: 'reject', reason: `Technical interview weak (${s}/10)`, stage: 'l3_interviewed' }
}

// ── L3 → Final Shortlist ─────────────────────────────────────────────────────
// Culture/final interview drives the call. Phase 7 UI will populate interviewCultureScore.
export interface FinalInputs {
  interviewCultureScore: number | null
}

export function recommendForFinal(inputs: FinalInputs): RecommendationResult | null {
  if (inputs.interviewCultureScore == null) return null
  const s = inputs.interviewCultureScore
  if (s >= 7) return { recommendation: 'advance', reason: `Strong culture fit (${s}/10)`, stage: 'final_shortlist' }
  if (s >= 5) return { recommendation: 'hold',    reason: `Culture fit borderline (${s}/10) — discuss`, stage: 'final_shortlist' }
  return { recommendation: 'reject', reason: `Culture fit weak (${s}/10)`, stage: 'final_shortlist' }
}

// ── Final → Hired ────────────────────────────────────────────────────────────
// Offer acceptance signal. Phase 7 — offer model not yet defined.
export function recommendForHired(_inputs: any): RecommendationResult | null {
  return null
}

// Route a candidate to the right recommender based on their current stage.
export function computeRecommendationForCandidate(candidate: {
  pipelineStage: string
  cvMatchScore?: number | null
  compositeScore?: number | null
  commitmentScore?: number | null
  hardFilterPass?: boolean | null
  hardFilterFailReason?: string | null
  dataTags?: any
  interviewTechnicalScore?: number | null
  interviewCultureScore?: number | null
}): RecommendationResult | null {
  const next = NEXT_STAGE_FOR[candidate.pipelineStage]
  if (!next) return null

  const missingSkills = (candidate.dataTags?.evidence?.mustHaveSkills || [])
    .filter((s: any) => s && s.found === false)
    .map((s: any) => s.skill)

  switch (next) {
    case 'l1_cv_screened':
      return recommendForL1({
        cvMatchScore:         candidate.cvMatchScore ?? null,
        hardFilterPass:       candidate.hardFilterPass ?? null,
        hardFilterFailReason: candidate.hardFilterFailReason ?? null,
        missingSkills,
      })
    case 'l2_wa_screened':
      return recommendForL2({
        compositeScore:       candidate.compositeScore ?? null,
        commitmentScore:      candidate.commitmentScore ?? null,
        hardFilterPass:       candidate.hardFilterPass ?? null,
        hardFilterFailReason: candidate.hardFilterFailReason ?? null,
        missingSkills,
      })
    case 'l3_interviewed':
      return recommendForL3({ interviewTechnicalScore: candidate.interviewTechnicalScore ?? null })
    case 'final_shortlist':
      return recommendForFinal({ interviewCultureScore: candidate.interviewCultureScore ?? null })
    case 'hired':
      return recommendForHired({})
  }
}
