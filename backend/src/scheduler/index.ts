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

// ── CRON: CV screening retry sweep — every minute (v1.13.0) ──────────────
// "No CV left behind." Picks up candidates whose initial score-cv call
// didn't land (Claude error, ai-engine offline, etc.) and retries up to 3x.
// Eligibility: pipelineStage in (applied, evaluated), cvScreeningScore IS
// NULL, scoringAttempts < 3, and the row is older than 2 minutes (so we
// don't race the synchronous bulk-upload / public-apply fire-and-forget).
const RETRY_CAP = 3
const RETRY_DELAY_MS = 2 * 60 * 1000

cron.schedule('* * * * *', async () => {
  const cutoff = new Date(Date.now() - RETRY_DELAY_MS)

  const stalled = await prisma.candidate.findMany({
    where: {
      pipelineStage:    { in: ['applied', 'evaluated'] },
      cvScreeningScore: null,
      scoringAttempts:  { lt: RETRY_CAP },
      createdAt:        { lt: cutoff },
    },
    select: { id: true, jobId: true, scoringAttempts: true, fullName: true },
    take: 20,
  })

  if (stalled.length === 0) return
  logger.info(`Retry sweep: ${stalled.length} candidates with null cvScreeningScore`)

  const AI = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`
  for (const c of stalled) {
    try {
      await axios.post(`${AI}/api/v1/ai/score-cv`, { candidateId: c.id, jobId: c.jobId }, { timeout: 60000 })
      logger.info(`Retry-scored ${c.id} (attempt ${c.scoringAttempts + 1})`)
    } catch (err: any) {
      logger.warn(`Retry failed ${c.id} (attempt ${c.scoringAttempts + 1}/${RETRY_CAP}): ${err?.message}`)
    }
  }

  // After 3 failed attempts, surface the row so a recruiter can intervene.
  // Don't auto-reject — the failure is on our side, not the candidate's.
  const burned = await prisma.candidate.findMany({
    where: {
      pipelineStage:    { in: ['applied', 'evaluated'] },
      cvScreeningScore: null,
      scoringAttempts:  { gte: RETRY_CAP },
    },
    select: { id: true, fullName: true, dataTags: true },
    take: 20,
  })
  for (const c of burned) {
    const tags = (c.dataTags as any) || {}
    if (tags.scoringFailed) continue
    await prisma.candidate.update({
      where: { id: c.id },
      data:  { dataTags: { ...tags, scoringFailed: true, scoringFailedAt: new Date().toISOString() } },
    })
    logger.error(`Scoring permanently failed for ${c.id} (${c.fullName || 'unknown'}) after ${RETRY_CAP} attempts`)
  }
})

app.listen(PORT, () => logger.info(`📅 Scheduler running on http://localhost:${PORT}`))
