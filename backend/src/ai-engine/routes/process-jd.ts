// src/ai-engine/routes/process-jd.ts
import { Router } from 'express'
import { extractJdCriteria, generateBaselineQuestions } from '../ai-service'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const processJdRoute = Router()

processJdRoute.post('/process-jd', async (req, res) => {
  const { jobId, jdText, title, hiringCompany, locationCountry, requiredSkills, minExperienceYears, aiMandatoryFields } = req.body

  try {
    logger.info(`Processing JD for job: ${jobId}`)

    const extractedCriteria = await extractJdCriteria({
      title, hiringCompany, locationCountry, requiredSkills, minExperienceYears, jdText,
    })

    const questionsResult = await generateBaselineQuestions({
      title,
      locationCountry,
      roleCategory: extractedCriteria.roleCategory,
      mustHave:     extractedCriteria.mustHave,
      aiMandatoryFields,
    })

    const screeningQuestions = questionsResult.questions

    if (jobId) {
      await prisma.job.update({
        where: { id: jobId },
        data: { extractedCriteria, screeningQuestions },
      })
    }

    logger.info(`JD processed: ${title} — ${screeningQuestions.length} questions generated`)

    res.json({ success: true, data: { extractedCriteria, screeningQuestions } })
  } catch (err: any) {
    logger.error('JD processing error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})
