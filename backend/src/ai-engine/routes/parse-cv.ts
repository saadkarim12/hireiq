// src/ai-engine/routes/parse-cv.ts
import { Router } from 'express'
import { callClaudeWithTool, CV_TOOLS, SCORE_TOOLS } from '../claude-client'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const parseCvRoute = Router()

parseCvRoute.post('/parse-cv', async (req, res) => {
  const { candidateId, cvText, language = 'en' } = req.body

  try {
    logger.info(`Parsing CV for candidate: ${candidateId}`)

    const cvStructured = await callClaudeWithTool<any>(
      `You are an expert CV parser specialising in Gulf region CVs.
You handle both Arabic (RTL) and English CVs, and mixed bilingual CVs.
You understand Gulf-specific CV conventions: Iqama number, photo included, marital status, nationality, Hijri dates.
Convert Hijri dates to Gregorian where needed.
Map Arabic institution names to internationally recognised equivalents.
Respond only using the provided tool.`,
      `Parse this CV text and extract all structured information.
Language: ${language}
CV Text:
---
${cvText}
---`,
      CV_TOOLS,
      'parse_cv'
    )

    // Update candidate in database
    if (candidateId) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          fullName: cvStructured.fullName,
          email: cvStructured.email,
          currentRole: cvStructured.currentRole,
          yearsExperience: cvStructured.yearsExperienceTotal,
          cvStructured,
          cvType: 'full_cv',
          conversationState: 'processing',
        },
      })
    }

    logger.info(`CV parsed: ${cvStructured.fullName} — ${cvStructured.yearsExperienceTotal} years`)

    res.json({ success: true, data: cvStructured })
  } catch (err: any) {
    logger.error('CV parse error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})
