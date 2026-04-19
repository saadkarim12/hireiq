// src/ai-engine/recommendations.ts
// AI recommendations per pipeline transition.
// Principle: AI proposes, recruiter decides. Never auto-advance.

export type Recommendation = 'advance' | 'hold' | 'reject'

export interface RecommendationResult {
  recommendation: Recommendation
  reason: string
  stage: NextStageKey
}

export type NextStageKey =
  | 'l1_cv_screened'
  | 'l2_wa_screened'
  | 'l3_interviewed'
  | 'final_shortlist'
  | 'hired'

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

export interface L1Inputs {
  compositeScore: number | null
  commitmentScore: number | null
  hardFilterPass: boolean | null
  hardFilterFailReason?: string | null
  missingSkills?: string[]
}

// Applied → L1 CV Screened — fully implemented
export function recommendForL1(inputs: L1Inputs): RecommendationResult | null {
  const { compositeScore, commitmentScore, hardFilterPass, hardFilterFailReason, missingSkills } = inputs

  // Need a composite score to recommend
  if (compositeScore == null) return null

  if (hardFilterPass === false) {
    const missing = missingSkills?.length ? missingSkills.slice(0, 3).join(', ') : (hardFilterFailReason || 'requirements')
    return { recommendation: 'reject', reason: `Missing must-have: ${missing}`, stage: 'l1_cv_screened' }
  }

  if (compositeScore < 55) {
    return { recommendation: 'reject', reason: `CV doesn't match role requirements (composite ${compositeScore})`, stage: 'l1_cv_screened' }
  }

  if (compositeScore >= 75) {
    if (commitmentScore != null && commitmentScore < 70) {
      return {
        recommendation: 'hold',
        reason: `High CV match (${compositeScore}) but vague screening answers (commitment ${commitmentScore}) — worth a call`,
        stage: 'l1_cv_screened',
      }
    }
    return {
      recommendation: 'advance',
      reason: `Strong CV match (${compositeScore}) + clear answers (commitment ${commitmentScore ?? '–'})`,
      stage: 'l1_cv_screened',
    }
  }

  // 55–74
  return {
    recommendation: 'hold',
    reason: `Borderline match (composite ${compositeScore}) — review carefully`,
    stage: 'l1_cv_screened',
  }
}

// L1 → L2: based on interview invitation acceptance — STUB (Phase 7)
export function recommendForL2(_candidate: any): RecommendationResult | null {
  return null
}

// L2 → L3: based on interview completion — STUB (Phase 7)
export function recommendForL3(_candidate: any): RecommendationResult | null {
  return null
}

// L3 → Final: based on interview feedback score — STUB (Phase 7)
export function recommendForFinal(_candidate: any): RecommendationResult | null {
  return null
}

// Final → Hired: based on offer acceptance — STUB (Phase 7)
export function recommendForHired(_candidate: any): RecommendationResult | null {
  return null
}

// Route a candidate to the right recommender based on their current stage
export function computeRecommendationForCandidate(candidate: {
  pipelineStage: string
  compositeScore?: number | null
  commitmentScore?: number | null
  hardFilterPass?: boolean | null
  hardFilterFailReason?: string | null
  dataTags?: any
}): RecommendationResult | null {
  const next = NEXT_STAGE_FOR[candidate.pipelineStage]
  if (!next) return null

  switch (next) {
    case 'l1_cv_screened': {
      const missing = (candidate.dataTags?.evidence?.mustHaveSkills || [])
        .filter((s: any) => s && s.found === false)
        .map((s: any) => s.skill)
      return recommendForL1({
        compositeScore: candidate.compositeScore ?? null,
        commitmentScore: candidate.commitmentScore ?? null,
        hardFilterPass: candidate.hardFilterPass ?? null,
        hardFilterFailReason: candidate.hardFilterFailReason ?? null,
        missingSkills: missing,
      })
    }
    case 'l2_wa_screened':  return recommendForL2(candidate)
    case 'l3_interviewed':  return recommendForL3(candidate)
    case 'final_shortlist': return recommendForFinal(candidate)
    case 'hired':           return recommendForHired(candidate)
  }
}
