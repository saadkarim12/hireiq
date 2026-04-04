// src/scheduler/index.ts
import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import axios from 'axios'
import { prisma } from '../shared/db'
import { logger } from '../shared/logger'

const app  = express()
const PORT = process.env.SCHEDULER_PORT || 3004
const WA   = `http://localhost:${process.env.WHATSAPP_PORT || 3003}`

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'scheduler' }))

// ── CRON: Interview reminders — every hour ─────────────────────────────────
cron.schedule('0 * * * *', async () => {
  logger.info('⏰ Running interview reminder check...')

  const now    = new Date()
  const in48h  = new Date(now.getTime() + 48 * 3600000)
  const in24h  = new Date(now.getTime() + 24 * 3600000)
  const in4h   = new Date(now.getTime() +  4 * 3600000)

  // 48h reminders
  const need48h = await prisma.interview.findMany({
    where: { status: 'confirmed', reminder48hSent: false, scheduledAt: { lte: in48h, gte: now } },
    include: { candidate: { select: { waNumberEncrypted: true, preferredLanguage: true, agencyId: true } } },
  })
  for (const interview of need48h) {
    const waNumber = Buffer.from(interview.candidate.waNumberEncrypted, 'base64').toString()
    const lang = interview.candidate.preferredLanguage || 'en'
    const scheduledAt = interview.scheduledAt!
    const msg = lang === 'ar'
      ? `تذكير: لديك مقابلة غداً في الساعة ${scheduledAt.toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit' })}. نتطلع للقائك! 📅`
      : `Reminder: You have an interview tomorrow at ${scheduledAt.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}. Looking forward to meeting you! 📅`

    await axios.post(`${WA}/api/v1/wa/send`, {
      agencyId: interview.candidate.agencyId,
      waNumber,
      message: msg,
    }).catch(() => {})

    await prisma.interview.update({ where: { id: interview.id }, data: { reminder48hSent: true } })
    logger.info(`48h reminder sent: ${interview.id}`)
  }

  // 24h reminders
  const need24h = await prisma.interview.findMany({
    where: { status: 'confirmed', reminder24hSent: false, scheduledAt: { lte: in24h, gte: now } },
    include: { candidate: { select: { waNumberEncrypted: true, preferredLanguage: true, agencyId: true } } },
  })
  for (const interview of need24h) {
    const waNumber = Buffer.from(interview.candidate.waNumberEncrypted, 'base64').toString()
    const lang = interview.candidate.preferredLanguage || 'en'
    const msg = lang === 'ar'
      ? `تذكير مهم: مقابلتك اليوم خلال 24 ساعة. هل أنت مستعد؟ اكتب *تأكيد* لتأكيد حضورك.`
      : `Important reminder: Your interview is in 24 hours. Type *CONFIRM* to confirm your attendance.`

    await axios.post(`${WA}/api/v1/wa/send`, {
      agencyId: interview.candidate.agencyId,
      waNumber,
      message: msg,
    }).catch(() => {})

    await prisma.interview.update({ where: { id: interview.id }, data: { reminder24hSent: true } })
    logger.info(`24h reminder sent: ${interview.id}`)
  }
})

// ── CRON: Data deletion — daily at 2am ────────────────────────────────────
cron.schedule('0 2 * * *', async () => {
  logger.info('🗑️  Running data deletion job...')

  const result = await prisma.candidate.updateMany({
    where: {
      pipelineStage: 'rejected',
      deletionScheduledAt: { lte: new Date() },
      fullName: { not: '[DELETED]' },
    },
    data: {
      fullName:           '[DELETED]',
      waNumberEncrypted:  '[DELETED]',
      email:              null,
      cvFileUrl:          null,
      cvStructured:       undefined,
      aiSummary:          '[Data deleted per retention policy]',
    },
  })

  if (result.count > 0) logger.info(`Deleted personal data for ${result.count} rejected candidates`)
})

// ── CRON: Stale job alerts — daily at 9am ────────────────────────────────
cron.schedule('0 9 * * *', async () => {
  logger.info('📋 Checking for stale jobs...')

  const staleJobs = await prisma.job.findMany({
    where: {
      status: 'active',
      activatedAt: { lte: new Date(Date.now() - 14 * 86400000) },
      candidates: { none: { createdAt: { gte: new Date(Date.now() - 5 * 86400000) } } },
    },
    include: { recruiter: { select: { email: true, fullName: true } } },
  })

  for (const job of staleJobs) {
    logger.warn(`Stale job: "${job.title}" — no applications in 5 days`)
    // TODO: send email alert to recruiter
  }
})

// ── CRON: AI scoring queue — every 5 minutes ─────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  const unscored = await prisma.candidate.findMany({
    where: {
      pipelineStage: 'cv_received',
      compositeScore: null,
      consentGiven: true,
    },
    take: 10,
  })

  if (unscored.length === 0) return

  logger.info(`Processing ${unscored.length} unscored candidates...`)
  const AI = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`

  for (const candidate of unscored) {
    try {
      await axios.post(`${AI}/api/v1/ai/score`, {
        candidateId: candidate.id,
        jobId: candidate.jobId,
      }, { timeout: 60000 })
      logger.info(`Scored: ${candidate.id}`)
    } catch (err: any) {
      logger.warn(`Score failed: ${candidate.id} — ${err.message}`)
    }
  }
})

app.listen(PORT, () => logger.info(`📅 Scheduler running on http://localhost:${PORT}`))
