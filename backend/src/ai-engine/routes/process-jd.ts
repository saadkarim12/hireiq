// src/ai-engine/routes/process-jd.ts
import { Router } from 'express'
import { callClaudeWithTool, JD_TOOLS, QUESTION_TOOLS } from '../claude-client'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const processJdRoute = Router()

processJdRoute.post('/process-jd', async (req, res) => {
  const { jobId, jdText, title, hiringCompany, locationCountry, requiredSkills, minExperienceYears } = req.body

  try {
    logger.info(`Processing JD for job: ${jobId}`)

    // Step 1: Extract criteria
    const extractedCriteria = await callClaudeWithTool<any>(
      `You are a senior recruitment consultant specialising in UAE and KSA markets.
You analyse job descriptions and extract structured requirements.
You understand Gulf workplace culture and local context.
Respond only using the provided tool.`,
      `Analyse this job description and extract requirements:
Job Title: ${title}
Hiring Company: ${hiringCompany}
Country: ${locationCountry}
Required Skills: ${requiredSkills?.join(', ')}
Min Experience: ${minExperienceYears} years

Job Description:
---
${jdText}
---`,
      JD_TOOLS,
      'extract_jd_criteria'
    )

    // Step 2: Generate questions
    const questionsResult = await callClaudeWithTool<{ questions: any[] }>(
      `You are an expert recruitment consultant with 15 years experience in UAE and KSA.
You create WhatsApp screening questions that are conversational and reveal genuine candidate quality.
Questions must be answerable in 2-4 sentences. Not yes/no.
Generate questions in BOTH English and formal Gulf Arabic.
Respond only using the provided tool.`,
      `Generate 5 WhatsApp screening questions for this role:
Job Title: ${title}
Role Category: ${extractedCriteria.roleCategory}
Must-Have Requirements: ${extractedCriteria.mustHave?.join(', ')}
Country: ${locationCountry}

Questions must cover:
1. Genuine motivation for this specific role
2. Specific experience proving a key must-have skill
3. Current salary and expectations (frame naturally)
4. Notice period and availability
5. A role-specific technical or situational question`,
      QUESTION_TOOLS,
      'generate_screening_questions'
    )

    const screeningQuestions = questionsResult.questions

    // Update job in database
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
