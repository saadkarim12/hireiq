// src/ai-engine/routes/generate-jd.ts
import { Router } from 'express'
import { callClaudeWithTool } from '../claude-client'
import Anthropic from '@anthropic-ai/sdk'

export const generateJdRoute = Router()

const JD_TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_jd',
    description: 'Generate a bilingual JD from guided recruiter answers',
    input_schema: {
      type: 'object' as const,
      properties: {
        jdEn: { type: 'string', description: 'Full English JD, professional format, 300-500 words' },
        jdAr: { type: 'string', description: 'Full Arabic JD in Gulf Arabic business register, NOT a translation' },
      },
      required: ['jdEn','jdAr'],
    },
  },
]

generateJdRoute.post('/generate-jd', async (req, res) => {
  const { title, hiringCompany, locationCountry, requiredSkills, jdQ1, jdQ2, jdQ3, jdQ4, jdQ5 } = req.body
  try {
    const result = await callClaudeWithTool<any>(
      `You are a senior recruitment consultant specialising in UAE and KSA markets.
You write bilingual job descriptions in professional English and Gulf Arabic business register.
The Arabic version is NOT a translation — it is written natively in the formal Gulf Arabic business style used by companies like Emaar, STC, ADNOC, and SABIC.
Structure the JD with: Role Overview, Key Responsibilities (5-7 bullets), Requirements (experience + skills), What We Offer.
Keep it focused and specific — not generic corporate language.`,
      `Write a bilingual job description:
Job Title: ${title}
Company: ${hiringCompany}
Country: ${locationCountry === 'AE' ? 'UAE' : locationCountry === 'SA' ? 'Saudi Arabia' : locationCountry}
Required Skills: ${requiredSkills?.join(', ')}

Recruiter's answers:
Q1 (Daily responsibilities): ${jdQ1}
Q2 (Essential experience): ${jdQ2}
Q3 (Success in 6 months): ${jdQ3 || 'Not specified'}
Q4 (Team culture): ${jdQ4 || 'Not specified'}
Q5 (Industry background): ${jdQ5 || 'Not specified'}`,
      JD_TOOLS,
      'generate_jd'
    )
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})
