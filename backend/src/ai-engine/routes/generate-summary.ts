// src/ai-engine/routes/generate-summary.ts
import { Router } from 'express'
import { callClaudeWithTool, SUMMARY_TOOLS } from '../claude-client'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const generateSummaryRoute = Router()

generateSummaryRoute.post('/summarize', async (req, res) => {
  const { candidateId, jobId } = req.body

  try {
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ])

    if (!candidate || !job) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })
    }

    const tags = candidate.dataTags as any
    const cv   = candidate.cvStructured as any

    const summary = await callClaudeWithTool<{ summary: string }>(
      `You are a senior recruitment consultant writing candidate briefings for your colleagues.
Write in professional British English. Be concise and specific.
Write exactly 3-5 sentences. Structure:
1. Experience overview and key matching qualifications
2. Practical factors (availability, salary, location)
3. One specific concern or gap if any
4. Overall signal — worth interviewing?
Do NOT start with the candidate's name. Start with their role.
Do NOT include scores or numbers — those are shown separately.
Be honest. Flag concerns clearly but professionally.`,
      `Write a recruiter briefing for this candidate:

Role applied for: ${job.title} at ${job.hiringCompany} (${job.locationCountry})

Candidate profile:
- Current role: ${candidate.currentRole || 'Not specified'} 
- Years experience: ${candidate.yearsExperience || 'Unknown'}
- Key skills: ${cv?.skills?.slice(0, 8).join(', ') || 'Not extracted'}
- Salary expectation: ${candidate.salaryExpectation ? `${job.currency} ${candidate.salaryExpectation.toLocaleString()}/month` : 'Not stated'}
- Job salary range: ${job.currency} ${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}/month
- Availability: ${tags?.availability || 'Unknown'}
- Visa status: ${candidate.visaStatus || 'Not stated'}
- Languages: ${tags?.languageCapability || 'Unknown'}
- Authenticity flag: ${candidate.authenticityFlag}
- Composite score: ${candidate.compositeScore}/100
- Commitment score: ${candidate.commitmentScore}/100`,
      SUMMARY_TOOLS,
      'generate_candidate_summary'
    )

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { aiSummary: summary.summary },
    })

    logger.info(`Summary generated for candidate: ${candidateId}`)
    res.json({ success: true, data: { summary: summary.summary } })
  } catch (err: any) {
    logger.error('Summary generation error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})

// ── Batch summarize all shortlisted candidates for a job ──────────────────────
generateSummaryRoute.post('/summarize-shortlist', async (req, res) => {
  const { jobId } = req.body

  try {
    const shortlisted = await prisma.candidate.findMany({
      where: { jobId, pipelineStage: 'shortlisted', aiSummary: null },
    })

    logger.info(`Batch summarizing ${shortlisted.length} candidates for job: ${jobId}`)

    const results = []
    for (const candidate of shortlisted) {
      try {
        const job = await prisma.job.findUnique({ where: { id: jobId } })
        if (!job) continue

        const tags = candidate.dataTags as any
        const cv   = candidate.cvStructured as any

        const result = await callClaudeWithTool<{ summary: string }>(
          `You are a senior recruitment consultant. Write concise 3-5 sentence candidate briefings. Be honest, specific, and professional.`,
          `Brief candidate for ${job.title}: current role ${candidate.currentRole}, ${candidate.yearsExperience} years exp, skills: ${cv?.skills?.slice(0, 5).join(', ')}, salary expectation ${candidate.salaryExpectation}, availability ${tags?.availability}. Score: ${candidate.compositeScore}/100. Authenticity: ${candidate.authenticityFlag}.`,
          SUMMARY_TOOLS,
          'generate_candidate_summary'
        )

        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { aiSummary: result.summary },
        })

        results.push({ candidateId: candidate.id, success: true })
      } catch (err) {
        results.push({ candidateId: candidate.id, success: false })
      }
    }

    res.json({ success: true, data: { processed: results.length, results } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})
