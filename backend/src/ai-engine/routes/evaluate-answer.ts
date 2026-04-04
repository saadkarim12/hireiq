// src/ai-engine/routes/evaluate-answer.ts
// This file is auto-imported in ai-engine index
import { Router } from 'express'
import { callClaudeWithTool } from '../claude-client'
import Anthropic from '@anthropic-ai/sdk'

export const evaluateAnswerRoute = Router()

const EVAL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'evaluate_answer',
    description: 'Evaluate the quality of a screening answer',
    input_schema: {
      type: 'object' as const,
      properties: {
        score:       { type: 'number', description: '0-100 quality score' },
        quality:     { type: 'string', enum: ['specific', 'adequate', 'vague', 'evasive'] },
        keySignal:   { type: 'string', description: 'Most important thing this answer reveals' },
        followUpNeeded: { type: 'boolean' },
      },
      required: ['score', 'quality', 'keySignal', 'followUpNeeded'],
    },
  },
]

evaluateAnswerRoute.post('/evaluate-answer', async (req, res) => {
  const { question, answer, jobTitle, questionType } = req.body

  try {
    const result = await callClaudeWithTool<any>(
      `You evaluate job candidate screening answers for UAE/KSA recruitment.
Score 0-100: 90+ = specific with concrete example, 70-89 = good and relevant, 50-69 = adequate but generic, 30-49 = vague, 0-29 = evasive or irrelevant.
Account for Gulf professional communication norms — some candidates are more formal/indirect.`,
      `Evaluate this screening answer for a ${jobTitle} role (question type: ${questionType}):

Question: ${question}
Answer: ${answer}

Is it specific? Does it directly answer the question? Are there concrete examples?`,
      EVAL_TOOLS,
      'evaluate_answer'
    )

    res.json({ success: true, data: result })
  } catch (err: any) {
    // Return default score on failure — don't block the conversation
    res.json({ success: true, data: { score: 60, quality: 'adequate', keySignal: 'Evaluation unavailable', followUpNeeded: false } })
  }
})
