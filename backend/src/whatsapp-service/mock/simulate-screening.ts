// src/whatsapp-service/mock/simulate-screening.ts
import { Router } from 'express'
import axios from 'axios'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const simulateScreeningRouter = Router()

const AI_URL = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`

type Tone = 'strong' | 'mixed' | 'vague'
type AnswerTone = 'strong' | 'vague'

const ANSWERS: Record<string, Record<AnswerTone, string>> = {
  motivation: {
    strong: "Your company has a strong reputation in the UAE market and this role aligns directly with my career path. I'm specifically drawn to the focus on cloud-first transformation and regional expansion.",
    vague:  "It seems like a good opportunity.",
  },
  experience: {
    strong: "At my previous role at Emirates NBD I led a 6-month cloud migration moving 40+ microservices to AWS. We reduced infrastructure costs by 32% and improved deployment frequency 4x. The hardest part was dependency mapping across legacy ESB systems.",
    vague:  "I have worked on many projects over the years.",
  },
  salary: {
    strong: "My expectation is AED 28,000 per month, based on 8 years of experience and current UAE market rates for similar roles.",
    vague:  "Whatever you think is fair.",
  },
  availability: {
    strong: "I have 30 days notice with my current employer, so I could start approximately one month after offer.",
    vague:  "I can start whenever.",
  },
  skill_probe: {
    strong: "I would begin with a discovery phase — stakeholder interviews, current-state architecture review, and risk assessment — then propose a phased roadmap with measurable wins in the first 90 days.",
    vague:  "I would figure it out as I go.",
  },
}

function answerFor(type: string | undefined, tone: Tone, questionIdx: number): string {
  const set = ANSWERS[type || 'motivation'] || ANSWERS.motivation
  // Mixed alternates strong/vague per question (3 strong + 2 vague across 5 questions)
  const actual: AnswerTone = tone === 'mixed'
    ? (questionIdx % 2 === 0 ? 'strong' : 'vague')
    : tone
  return set[actual]
}

// Pick tone: 60% strong (advance) / 25% mixed (hold) / 15% vague (reject)
function pickTone(): Tone {
  const r = Math.random()
  if (r < 0.60) return 'strong'
  if (r < 0.85) return 'mixed'
  return 'vague'
}

simulateScreeningRouter.get('/screening-candidates', async (_req, res) => {
  const list = await prisma.candidate.findMany({
    where: { pipelineStage: 'screening' },
    select: {
      id: true, fullName: true, currentRole: true, createdAt: true,
      job: { select: { id: true, title: true, hiringCompany: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  res.json({ success: true, data: list })
})

simulateScreeningRouter.post('/simulate-screening', async (req, res) => {
  const { candidateId } = req.body
  if (!candidateId) return res.status(400).json({ success: false, error: 'candidateId required' })

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId }, include: { job: true },
  })
  if (!candidate) return res.status(404).json({ success: false, error: 'not found' })

  const job = candidate.job
  const questions = (job.screeningQuestions || []) as any[]
  if (!questions.length) return res.status(400).json({ success: false, error: 'job has no screening questions' })

  const tone: Tone = pickTone()

  // Mark conversation as in-progress so the frontend kanban can show
  // "🔄 Screening in progress" while the ~15-30s async run completes.
  await prisma.candidate.update({
    where: { id: candidateId },
    data: { conversationState: 'screening_q1' },
  })

  const updates: { salaryExpectation?: number; noticePeriodDays?: number } = {}

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const answerText = answerFor(q.type, tone, i)

    await prisma.screeningMessage.create({
      data: {
        candidateId, agencyId: candidate.agencyId,
        direction: 'outbound', messageType: 'screening_q',
        content: q.questionTextEn || '', questionIndex: i,
      },
    })
    const inbound = await prisma.screeningMessage.create({
      data: {
        candidateId, agencyId: candidate.agencyId,
        direction: 'inbound', messageType: 'candidate_reply',
        content: answerText, questionIndex: i,
      },
    })

    try {
      const evalRes = await axios.post(`${AI_URL}/api/v1/ai/evaluate-answer`, {
        question: q.questionTextEn, answer: answerText,
        jobTitle: job.title, questionType: q.type,
      }, { timeout: 15000 })
      await prisma.screeningMessage.update({
        where: { id: inbound.id },
        data: {
          answerScore: evalRes.data?.data?.score ?? 60,
          answerQuality: evalRes.data?.data?.quality ?? 'adequate',
        },
      })
    } catch { /* default already set */ }

    if (q.type === 'salary') {
      const m = answerText.match(/\d[\d,]+/)
      if (m) updates.salaryExpectation = parseInt(m[0].replace(/,/g, ''))
    }
    if (q.type === 'availability') {
      const m = answerText.match(/(\d+)\s*day/i)
      if (m) updates.noticePeriodDays = parseInt(m[1])
    }
  }

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { conversationState: 'cv_received', ...updates },
  })

  try {
    await axios.post(`${AI_URL}/api/v1/ai/score`, {
      candidateId, jobId: job.id,
    }, { timeout: 60000 })
  } catch (e: any) {
    logger.warn('simulate-screening: score call failed', { err: e.message })
  }

  const finalState = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      pipelineStage: true, compositeScore: true, commitmentScore: true, cvMatchScore: true,
      aiRecommendation: true, aiRecommendationReason: true, aiRecommendationStage: true,
    },
  })

  logger.info(`Simulated screening for ${candidateId} (tone=${tone}) → ${finalState?.pipelineStage} composite=${finalState?.compositeScore}`)
  res.json({ success: true, data: { tone, ...finalState } })
})
