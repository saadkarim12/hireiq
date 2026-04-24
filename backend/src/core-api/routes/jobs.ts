// src/core-api/routes/jobs.ts
import { Router } from 'express'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logger } from '../../shared/logger'
import { io } from '../index'
import axios from 'axios'

export const jobsRouter = Router()
jobsRouter.use(requireAuth)

const AI_ENGINE_URL = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`

// Helper — generate unique slug
function generateSlug(title: string, company: string): string {
  const base = `${title}-${company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

function generateShortcode(): string {
  return 'JB' + Math.random().toString(36).slice(2, 7).toUpperCase()
}

// 4.3.c — Duplicate pre-check. Wizard calls this on title/company blur to warn
// the recruiter before submission. Returns { duplicate: bool, existing?: {...} }.
jobsRouter.get('/check-duplicate', async (req: AuthRequest, res) => {
  try {
    const { title, hiringCompany } = req.query
    if (!title || !hiringCompany) return res.json({ success: true, data: { duplicate: false } })
    const existing = await prisma.job.findFirst({
      where: {
        agencyId: req.user!.agencyId,
        title: { equals: String(title), mode: 'insensitive' },
        hiringCompany: { equals: String(hiringCompany), mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true, title: true, hiringCompany: true, createdAt: true },
    })
    res.json({ success: true, data: { duplicate: !!existing, existing: existing || null } })
  } catch (err: any) {
    res.json({ success: true, data: { duplicate: false } })
  }
})

// ── LIST JOBS ─────────────────────────────────────────────────────────────────
jobsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, cursor, limit = '20' } = req.query
    const take = Math.min(parseInt(limit as string), 50)

    const jobs = await prisma.job.findMany({
      where: {
        agencyId: req.user!.agencyId,
        ...(status && status !== 'all' ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
      include: {
        recruiter: { select: { id: true, fullName: true } },
        _count: { select: { candidates: true } },
      },
    })

    // Append computed counts
    const enriched = await Promise.all(jobs.map(async (job) => {
      const shortlistedCount = await prisma.candidate.count({
        where: { jobId: job.id, pipelineStage: 'shortlisted' },
      })
      const daysOpen = job.activatedAt
        ? Math.floor((Date.now() - job.activatedAt.getTime()) / 86400000)
        : 0
      return { ...job, applicationsCount: job._count.candidates, shortlistedCount, daysOpen }
    }))

    const lastId = jobs[jobs.length - 1]?.id
    res.json({ success: true, data: enriched, meta: { cursor: lastId, hasMore: jobs.length === take } })
  } catch (err) {
    logger.error('List jobs error', { err })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list jobs' } })
  }
})

// ── GET SINGLE JOB ─────────────────────────────────────────────────────────────
jobsRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId },
      include: { recruiter: { select: { id: true, fullName: true } } },
    })
    if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })
    res.json({ success: true, data: job })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get job' } })
  }
})

// ── CREATE JOB ────────────────────────────────────────────────────────────────
jobsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const { title, hiringCompany, locationCountry, locationCity, jobType, salaryMin, salaryMax, currency,
      requiredSkills, preferredSkills, minExperienceYears, requiredLanguages, jdText, closingDate,
      allowDuplicate } = req.body

    // 4.3.c — duplicate guard. Prevent accidental creation of another active
    // job with the same (agencyId, title, hiringCompany). Recruiter can force
    // through by resubmitting with allowDuplicate: true after seeing the warning.
    if (!allowDuplicate) {
      const existing = await prisma.job.findFirst({
        where: {
          agencyId: req.user!.agencyId,
          title: { equals: title, mode: 'insensitive' },
          hiringCompany: { equals: hiringCompany, mode: 'insensitive' },
          status: 'active',
        },
        select: { id: true, title: true, hiringCompany: true, createdAt: true },
      })
      if (existing) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_JOB',
            message: `An active job '${existing.title}' at ${existing.hiringCompany} already exists. Confirm this is a distinct role to continue.`,
            existing,
          },
        })
      }
    }

    const applyUrlSlug = generateSlug(title, hiringCompany)
    const waShortcode  = generateShortcode()

    // Create job first
    const job = await prisma.job.create({
      data: {
        agencyId: req.user!.agencyId,
        recruiterId: req.user!.id,
        title, hiringCompany, locationCountry, locationCity,
        jobType, salaryMin, salaryMax, currency: currency || 'AED',
        requiredSkills: requiredSkills || [],
        preferredSkills: preferredSkills || [],
        minExperienceYears: minExperienceYears || 0,
        requiredLanguages: requiredLanguages || ['English'],
        jdText, applyUrlSlug, waShortcode,
        status: 'draft',
        closingDate: closingDate ? new Date(closingDate) : null,
      },
    })

    // Call AI Engine to extract criteria and generate questions
    try {
      const aiRes = await axios.post(`${AI_ENGINE_URL}/api/v1/ai/process-jd`, {
        jobId: job.id,
        jdText,
        title,
        hiringCompany,
        locationCountry,
        requiredSkills,
        minExperienceYears,
      }, { timeout: 30000 })

      const { extractedCriteria, screeningQuestions } = aiRes.data.data

      await prisma.job.update({
        where: { id: job.id },
        data: { extractedCriteria, screeningQuestions },
      })

      res.status(201).json({ success: true, data: { ...job, extractedCriteria, screeningQuestions, applyUrl: `http://localhost:3000/apply/${applyUrlSlug}` } })
    } catch (aiErr) {
      logger.warn('AI Engine unavailable — job created without AI criteria', { jobId: job.id })
      res.status(201).json({ success: true, data: { ...job, extractedCriteria: null, screeningQuestions: [] } })
    }
  } catch (err: any) {
    const detail = err?.message || 'Unknown error'
    logger.error('Create job error', {
      name:    err?.name,
      message: detail,
      stack:   err?.stack?.split('\n').slice(0, 3).join(' | '),
    })
    // Prisma validation = client payload issue → 400 with the real message.
    // Anything else stays a 500 with a generic message.
    const isValidation = err?.name === 'PrismaClientValidationError' || err?.name === 'PrismaClientKnownRequestError'
    res.status(isValidation ? 400 : 500).json({
      success: false,
      error: {
        code:    isValidation ? 'VALIDATION' : 'INTERNAL_ERROR',
        message: isValidation ? detail.slice(0, 400) : 'Failed to create job',
      },
    })
  }
})

// ── ACTIVATE JOB ──────────────────────────────────────────────────────────────
jobsRouter.post('/:id/activate', async (req: AuthRequest, res) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId },
    })
    if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })
    if (job.status === 'active') return res.status(409).json({ success: false, error: { code: 'ALREADY_ACTIVE', message: 'Job is already active' } })

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { status: 'active', activatedAt: new Date() },
    })

    const applyUrl  = `http://localhost:3000/apply/${job.applyUrlSlug}`
    const waLink    = `https://wa.me/${job.waShortcode}`

    logger.info(`Job activated: ${job.title} (${job.id})`)

    res.json({ success: true, data: { ...updated, applyUrl, waLink } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to activate job' } })
  }
})

// ── UPDATE STATUS ──────────────────────────────────────────────────────────────
jobsRouter.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body
    if (!['paused', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Invalid status' } })
    }
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { status, ...(status === 'closed' ? { closedAt: new Date() } : {}) },
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update status' } })
  }
})

// ── GET PIPELINE COUNTS ───────────────────────────────────────────────────────
jobsRouter.get('/:id/pipeline', async (req: AuthRequest, res) => {
  try {
    const stages = ['applied','screening','cv_received','evaluated','shortlisted','interviewing','offered','hired','rejected','held']
    const counts: Record<string, number> = {}

    for (const stage of stages) {
      counts[stage] = await prisma.candidate.count({
        where: { jobId: req.params.id, agencyId: req.user!.agencyId, pipelineStage: stage as any },
      })
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    res.json({ success: true, data: { ...counts, total } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get pipeline' } })
  }
})

// ── GET CANDIDATES FOR JOB ────────────────────────────────────────────────────
jobsRouter.get('/:id/candidates', async (req: AuthRequest, res) => {
  try {
    const { stage, cursor, limit = '100', orderBy = 'compositeScore' } = req.query
    const take = Math.min(parseInt(limit as string), 200)

    const candidates = await prisma.candidate.findMany({
      where: {
        jobId: req.params.id,
        agencyId: req.user!.agencyId,
        ...(stage ? { pipelineStage: stage as any } : {}),
      },
      orderBy: orderBy === 'compositeScore'
        ? { compositeScore: 'desc' }
        : { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
    })

    res.json({ success: true, data: candidates, meta: { hasMore: candidates.length === take } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get candidates' } })
  }
})

// ── GET SHORTLIST ──────────────────────────────────────────────────────────────
jobsRouter.get('/:id/shortlist', async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 50)
    const candidates = await prisma.candidate.findMany({
      where: { jobId: req.params.id, agencyId: req.user!.agencyId, pipelineStage: 'shortlisted' },
      orderBy: { compositeScore: 'desc' },
      take: limit,
    })
    res.json({ success: true, data: candidates })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get shortlist' } })
  }
})

// ── EXPORT PDF ────────────────────────────────────────────────────────────────
jobsRouter.post('/:id/export/pdf', async (req: AuthRequest, res) => {
  // Simplified — returns a placeholder URL
  const downloadUrl = `http://localhost:3001/exports/shortlist-${req.params.id}.pdf`
  res.json({ success: true, data: { downloadUrl, expiresAt: new Date(Date.now() + 3600000).toISOString() } })
})
