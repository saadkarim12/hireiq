// src/ai-engine/routes/score-candidate.ts
import { Router } from 'express'
import { callClaudeWithTool, SCORE_TOOLS } from '../claude-client'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const scoreCandidateRoute = Router()

scoreCandidateRoute.post('/score', async (req, res) => {
  const { candidateId, jobId } = req.body

  try {
    logger.info(`Scoring candidate: ${candidateId} for job: ${jobId}`)

    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId }, include: { messages: true } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ])

    if (!candidate || !job) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate or job not found' } })
    }

    const criteria = job.extractedCriteria as any
    const screeningAnswers = candidate.messages
      .filter(m => m.direction === 'inbound' && m.questionIndex !== null)
      .map(m => `Q${(m.questionIndex || 0) + 1}: ${m.content} (Score: ${m.answerScore || 'N/A'})`)
      .join('\n')

    const scores = await callClaudeWithTool<any>(
      `You are a recruitment scoring engine for UAE and KSA market.
Score candidates objectively based on their CV and screening answers.
Apply hard filters first — if candidate fails mandatory requirements, mark hardFilterPass as false.
Be honest about concerns — flag AI-polished CVs if keyword density is suspiciously high.
Composite score formula: (cvMatchScore * 0.40) + (commitmentScore * 0.40) + (salaryFitScore * 0.20)
Respond only using the provided tool.`,
      `Score this candidate against the job requirements:

JOB: ${job.title} at ${job.hiringCompany}
Country: ${job.locationCountry}
Salary Range: ${job.currency} ${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()}/month
Min Experience: ${job.minExperienceYears} years
Required Skills: ${job.requiredSkills.join(', ')}
Must-Have Criteria: ${criteria?.mustHave?.join(', ') || 'Not specified'}

CANDIDATE:
Name: ${candidate.fullName || 'Unknown'}
Current Role: ${candidate.currentRole || 'Not specified'}
Years Experience: ${candidate.yearsExperience || 'Unknown'}
Salary Expectation: ${candidate.salaryExpectation ? `${job.currency} ${candidate.salaryExpectation.toLocaleString()}/month` : 'Not stated'}
Notice Period: ${candidate.noticePeriodDays !== null ? `${candidate.noticePeriodDays} days` : 'Unknown'}
Visa Status: ${candidate.visaStatus || 'Unknown'}
CV Skills: ${((candidate.cvStructured as any)?.skills || []).join(', ')}

SCREENING ANSWERS:
${screeningAnswers || 'No screening answers available'}

Apply hard filters:
- Min experience ${job.minExperienceYears} years: ${candidate.yearsExperience !== null ? (candidate.yearsExperience >= job.minExperienceYears ? 'PASS' : 'FAIL') : 'UNKNOWN'}
- Required skills present: Check CV skills vs required skills
- Visa requirements: ${job.requiredLanguages.join(', ')}`,
      SCORE_TOOLS,
      'score_candidate'
    )

    // Update candidate with scores
    const updated = await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        commitmentScore:  scores.commitmentScore,
        cvMatchScore:     scores.cvMatchScore,
        salaryFitScore:   scores.salaryFitScore,
        compositeScore:   scores.compositeScore,
        hardFilterPass:   scores.hardFilterPass,
        hardFilterFailReason: scores.hardFilterFailReason || null,
        authenticityFlag: scores.authenticityFlag || 'none',
        dataTags:         scores.dataTags || {},
        pipelineStage:    scores.hardFilterPass ? 'evaluated' : 'evaluated',
      },
    })

    // Auto-shortlist if above threshold
    if (scores.hardFilterPass && scores.compositeScore >= 65) {
      const shortlistedCount = await prisma.candidate.count({
        where: { jobId, pipelineStage: 'shortlisted' },
      })

      if (shortlistedCount < 20) {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: { pipelineStage: 'shortlisted', shortlistedAt: new Date() },
        })
        logger.info(`Candidate auto-shortlisted: ${candidateId} (score: ${scores.compositeScore})`)
      }
    }

    logger.info(`Candidate scored: ${candidateId} — composite: ${scores.compositeScore}`)
    res.json({ success: true, data: scores })
  } catch (err: any) {
    logger.error('Score candidate error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})
