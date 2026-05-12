import { Router } from 'express'
import { callClaudeWithTool } from '../claude-client'
import { scoreCvAgainstJob, type CvScoreResult } from '../ai-service'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'
import Anthropic from '@anthropic-ai/sdk'
import { recommendForL1, recommendForL2 } from '../../shared/recommendations'

export const scoreCandidateRoute = Router()

// Build the score-CV input from a candidate + job DB row.
function buildScoreInput(candidate: any, job: any) {
  const criteria = job.extractedCriteria as any
  return {
    job: {
      title:              job.title,
      hiringCompany:      job.hiringCompany,
      locationCountry:    job.locationCountry,
      minExperienceYears: job.minExperienceYears,
      requiredSkills:     job.requiredSkills,
    },
    mustHave: criteria?.mustHave || [],
    candidate: {
      currentRole:     candidate.currentRole,
      yearsExperience: candidate.yearsExperience,
      visaStatus:      candidate.visaStatus,
      cvSkills:        ((candidate.cvStructured as any)?.skills || []) as string[],
      cvStructured:    candidate.cvStructured,
    },
  }
}

// Translate a CvScoreResult into the recommendation engine input.
// Derives hardFilterPass from the 40% screening threshold and reports any
// required skills Claude could not evidence so the recruiter sees the gap.
function buildRecommendationInput(result: CvScoreResult) {
  const missingSkills = (result.evidence?.skillsBreakdown || [])
    .filter((s: any) => s && s.found === false)
    .map((s: any) => s.skill)
  const hardFilterPass = result.cvScreeningScore >= 40
  const hardFilterFailReason = hardFilterPass
    ? undefined
    : `CV screening score ${result.cvScreeningScore} below 40% threshold${missingSkills.length ? ` — missing: ${missingSkills.slice(0, 3).join(', ')}` : ''}`
  return {
    rec: recommendForL1({
      cvScreeningScore: result.cvScreeningScore,
      hardFilterPass,
      hardFilterFailReason,
      missingSkills,
    }),
    hardFilterPass,
    hardFilterFailReason,
  }
}

// ── CV-only endpoint (Applied stage) — persists to DB ───────────────────────
scoreCandidateRoute.post('/score-cv', async (req, res) => {
  const { candidateId, jobId } = req.body
  try {
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ])
    if (!candidate || !job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })

    // Bump scoringAttempts at the start so failed Claude calls still count
    // toward the retry cap (otherwise a row that always errors loops forever).
    await prisma.candidate.update({
      where: { id: candidateId },
      data:  { scoringAttempts: { increment: 1 } },
    })

    const result = await scoreCvAgainstJob(buildScoreInput(candidate, job))
    const { rec, hardFilterPass, hardFilterFailReason } = buildRecommendationInput(result)

    const autoReject = result.cvScreeningScore < 40
    const noContact = !candidate.email && !candidate.phoneNumber

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        skillsScore:          result.skillsScore,
        experienceScore:      result.experienceScore,
        cvScreeningScore:     result.cvScreeningScore,
        cvMatchScore:         result.cvScreeningScore, // mirrored for downstream composite scoring
        hardFilterPass,
        hardFilterFailReason: hardFilterFailReason ? hardFilterFailReason.slice(0, 200) : null,
        authenticityFlag:     result.authenticityFlag || 'none',
        ...(autoReject || noContact ? {
          pipelineStage:   'rejected' as const,
          rejectedFromStage: 'applied',
          rejectionReason: noContact ? 'no_contact' : 'low_screening_score',
        } : {}),
        dataTags: JSON.parse(JSON.stringify({
          ...(result.dataTags || {}),
          evidence:        result.evidence || {},
          parseConfidence: result.parseConfidence || 75,
          scoreBreakdown:  result.scoreBreakdown,
        })),
        aiRecommendation:       rec?.recommendation || null,
        aiRecommendationReason: rec?.reason ? rec.reason.slice(0, 500) : null,
        aiRecommendationStage:  rec?.stage || null,
      },
    })

    logger.info(`Scored CV-only ${candidateId}: cvScreening=${result.cvScreeningScore} (S${result.skillsScore}/E${result.experienceScore}) → rec=${rec?.recommendation || 'none'}${autoReject ? ' [auto-rejected <40]' : ''}${noContact ? ' [no contact]' : ''}`)
    res.json({ success: true, data: { ...result, aiRecommendation: rec, autoRejected: autoReject || noContact } })
  } catch (err: any) {
    logger.error('Score-CV error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})

// ── Preview-score: dry-run CV scoring, no DB write ──────────────────────────
// Used by the Talent Pool drawer to show "what would this candidate score for
// THIS job" before the recruiter commits to creating a pipeline row.
scoreCandidateRoute.post('/preview-score-cv', async (req, res) => {
  const { candidateId, jobId } = req.body
  try {
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ])
    if (!candidate || !job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })

    const result = await scoreCvAgainstJob(buildScoreInput(candidate, job))
    const { rec } = buildRecommendationInput(result)

    logger.info(`Preview-scored ${candidateId} for job ${jobId}: cvScreening=${result.cvScreeningScore} (S${result.skillsScore}/E${result.experienceScore}) → rec=${rec?.recommendation || 'none'}`)
    res.json({ success: true, data: { ...result, aiRecommendation: rec } })
  } catch (err: any) {
    logger.error('Preview-score-CV error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})

// ── Full scoring endpoint (post-WhatsApp, L1 stage) ─────────────────────────
// Unchanged from before — still uses the legacy SCORE_TOOLS_V2 schema since
// post-WhatsApp scoring (cv + commitment + salary + composite) is a separate
// concern from Applied-stage CV-only scoring.

const SCORE_TOOLS_V2: Anthropic.Tool[] = [
  {
    name: 'score_candidate',
    description: 'Score candidate with per-criterion evidence',
    input_schema: {
      type: 'object' as const,
      properties: {
        commitmentScore:      { type: 'number' },
        cvMatchScore:         { type: 'number' },
        salaryFitScore:       { type: 'number' },
        compositeScore:       { type: 'number' },
        hardFilterPass:       { type: 'boolean' },
        hardFilterFailReason: { type: 'string' },
        authenticityFlag:     { type: 'string', enum: ['none','low','medium','high'] },
        parseConfidence:      { type: 'number', description: '0-100 how cleanly CV was parsed' },
        evidence: {
          type: 'object',
          properties: {
            experience: {
              type: 'object',
              properties: {
                found:    { type: 'boolean' },
                years:    { type: 'number' },
                evidence: { type: 'string' },
              }
            },
            mustHaveSkills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  skill:    { type: 'string' },
                  found:    { type: 'boolean' },
                  evidence: { type: 'string' },
                }
              }
            },
            salaryEvidence:    { type: 'string' },
            visaEvidence:      { type: 'string' },
            aiAlterationFlags: { type: 'array', items: { type: 'string' } },
          }
        },
        dataTags: {
          type: 'object',
          properties: {
            seniorityLevel:     { type: 'string' },
            roleCategory:       { type: 'string' },
            languageCapability: { type: 'string' },
            availability:       { type: 'string' },
          }
        },
      },
      required: ['commitmentScore','cvMatchScore','salaryFitScore','compositeScore','hardFilterPass','dataTags','evidence','parseConfidence'],
    },
  },
]

scoreCandidateRoute.post('/score', async (req, res) => {
  const { candidateId, jobId } = req.body
  try {
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId }, include: { messages: true } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ])
    if (!candidate || !job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })

    const criteria = job.extractedCriteria as any
    const screeningAnswers = candidate.messages
      .filter(m => m.direction === 'inbound' && m.questionIndex !== null)
      .map(m => `Q${(m.questionIndex||0)+1}: ${m.content}`).join('\n')

    const scores = await callClaudeWithTool<any>(
      `You are a recruitment scoring engine for UAE and KSA.
Score objectively. Extract EXACT evidence from CV text for each criterion.
For mustHaveSkills: quote the exact CV phrase where found, or leave evidence empty.
parseConfidence: 0=garbled/table/image PDF, 100=clean plain text.
Flag AI-generated content: perfect JD keyword match, skills with no timeline support, generic achievement language.
Composite = (cvMatchScore*0.40) + (commitmentScore*0.40) + (salaryFitScore*0.20)`,
      `Score this candidate:
JOB: ${job.title} at ${job.hiringCompany} (${job.locationCountry})
Salary: ${job.currency} ${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}/month
Min experience: ${job.minExperienceYears} years
Required skills: ${job.requiredSkills.join(', ')}
Must-have: ${criteria?.mustHave?.join(', ')||'Not specified'}

CANDIDATE:
Role: ${candidate.currentRole||'Unknown'}
Experience: ${candidate.yearsExperience||'Unknown'} years
Salary expectation: ${candidate.salaryExpectation||'Not stated'}
Visa: ${candidate.visaStatus||'Unknown'}
CV skills: ${((candidate.cvStructured as any)?.skills||[]).join(', ')}
CV data: ${JSON.stringify(candidate.cvStructured||{}).slice(0,800)}

SCREENING ANSWERS:
${screeningAnswers||'None yet'}`,
      SCORE_TOOLS_V2,
      'score_candidate'
    )

    const returningInfo = await checkReturningCandidate(candidateId, jobId, candidate.agencyId)

    // AI proposes, recruiter decides — this is the L1 → L2 transition (post-screening).
    const missingSkills = (scores.evidence?.mustHaveSkills || [])
      .filter((s: any) => s && s.found === false)
      .map((s: any) => s.skill)
    const rec = recommendForL2({
      compositeScore:       scores.compositeScore,
      commitmentScore:      scores.commitmentScore,
      hardFilterPass:       scores.hardFilterPass,
      hardFilterFailReason: scores.hardFilterFailReason,
      missingSkills,
    })

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        commitmentScore:        scores.commitmentScore,
        cvMatchScore:           scores.cvMatchScore,
        salaryFitScore:         scores.salaryFitScore,
        compositeScore:         scores.compositeScore,
        hardFilterPass:         scores.hardFilterPass,
        hardFilterFailReason:   scores.hardFilterFailReason ? String(scores.hardFilterFailReason).slice(0, 200) : null,
        authenticityFlag:       scores.authenticityFlag||'none',
        dataTags: JSON.parse(JSON.stringify({
          ...(scores.dataTags||{}),
          evidence:           scores.evidence||{},
          parseConfidence:    scores.parseConfidence||75,
          returningCandidate: returningInfo||null,
        })),
        aiRecommendation:       rec?.recommendation || null,
        aiRecommendationReason: rec?.reason ? rec.reason.slice(0, 500) : null,
        aiRecommendationStage:  rec?.stage || null,
      },
    })

    logger.info(`Scored ${candidateId}: composite=${scores.compositeScore} → rec=${rec?.recommendation || 'none'}`)
    res.json({ success: true, data: { ...scores, aiRecommendation: rec, returningCandidate: returningInfo } })
  } catch (err: any) {
    logger.error('Score error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})

async function checkReturningCandidate(candidateId: string, jobId: string, agencyId: string) {
  try {
    const current = await prisma.candidate.findUnique({ where: { id: candidateId } })
    if (!current) return null
    const whereClause: any[] = [{ waNumberHash: current.waNumberHash }]
    if (current.email) whereClause.push({ email: current.email })
    const previous = await prisma.candidate.findMany({
      where: { agencyId, id: { not: candidateId }, jobId: { not: jobId }, OR: whereClause },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    if (previous.length === 0) return null
    const prev = previous[0]
    const changePercent = calcDiff(JSON.stringify(prev.cvStructured||{}), JSON.stringify(current.cvStructured||{}))
    return {
      isReturning: true,
      previousJobTitle: (prev.job as any)?.title||'Unknown',
      previousDate: prev.createdAt.toISOString().split('T')[0],
      previousStatus: prev.pipelineStage,
      cvChangePercent: changePercent,
      previousCount: previous.length,
    }
  } catch { return null }
}

function calcDiff(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  if (wa.size === 0) return 0
  let changed = 0
  wb.forEach(w => { if (!wa.has(w)) changed++ })
  return Math.min(100, Math.round((changed / Math.max(wa.size, wb.size)) * 100))
}
