// src/core-api/routes/candidates.ts
import { Router } from 'express'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logger } from '../../shared/logger'
import { io } from '../index'

export const candidatesRouter = Router()
candidatesRouter.use(requireAuth)

// ── SEARCH TALENT POOL ────────────────────────────────────────────────────────
candidatesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { q, roleCategory, seniority, availability, cursor, limit = '50' } = req.query
    const take = Math.min(parseInt(limit as string), 100)

    const candidates = await prisma.candidate.findMany({
      where: {
        agencyId: req.user!.agencyId,
        pipelineStage: { notIn: ['rejected'] },
        ...(q ? {
          OR: [
            { fullName: { contains: q as string, mode: 'insensitive' } },
            { currentRole: { contains: q as string, mode: 'insensitive' } },
          ]
        } : {}),
      },
      orderBy: { compositeScore: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
    })

    // Filter by tags in JS (JSON field filtering)
    const filtered = candidates.filter(c => {
      const tags = c.dataTags as any
      if (roleCategory && tags?.roleCategory !== roleCategory) return false
      if (seniority && tags?.seniorityLevel !== seniority) return false
      if (availability && tags?.availability !== availability) return false
      return true
    })

    res.json({ success: true, data: filtered, meta: { hasMore: candidates.length === take, total: filtered.length } })
  } catch (err) {
    logger.error('Search candidates error', { err })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to search candidates' } })
  }
})

// ── GET FULL CANDIDATE ────────────────────────────────────────────────────────
candidatesRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const candidate = await prisma.candidate.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        interview: true,
      },
    })

    if (!candidate) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } })
    }

    // Generate pre-signed CV URL (mock for dev)
    const cvPreviewUrl = candidate.cvFileUrl
      ? `${candidate.cvFileUrl}?token=mock-presigned-token`
      : null

    res.json({
      success: true,
      data: {
        ...candidate,
        cvPreviewUrl,
        screeningTranscript: candidate.messages,
        scores: {
          compositeScore:  candidate.compositeScore,
          cvMatchScore:    candidate.cvMatchScore,
          commitmentScore: candidate.commitmentScore,
          salaryFitScore:  candidate.salaryFitScore,
          hardFilterPass:  candidate.hardFilterPass,
          hardFilterFailReason: candidate.hardFilterFailReason,
        },
      },
    })
  } catch (err) {
    logger.error('Get candidate error', { err })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get candidate' } })
  }
})

// ── UPDATE PIPELINE STATUS ────────────────────────────────────────────────────
candidatesRouter.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { pipelineStage, rejectionReason, note } = req.body
    const candidate = await prisma.candidate.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId },
    })
    if (!candidate) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } })
    }

    const updates: any = { pipelineStage }
    if (rejectionReason) updates.rejectionReason = rejectionReason
    if (note) updates.recruiterNote = note
    if (pipelineStage === 'shortlisted') updates.shortlistedAt = new Date()
    if (pipelineStage === 'hired') updates.hiredAt = new Date()
    if (pipelineStage === 'rejected') {
      updates.deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }

    const updated = await prisma.candidate.update({ where: { id: req.params.id }, data: updates })

    // Emit real-time update
    io.to(`agency:${req.user!.agencyId}`).emit('candidate:updated', {
      candidateId: updated.id,
      jobId: updated.jobId,
      pipelineStage: updated.pipelineStage,
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        agencyId: req.user!.agencyId,
        actorId: req.user!.id,
        actorType: 'user',
        entityType: 'candidates',
        entityId: candidate.id,
        action: 'candidate.status_changed',
        beforeState: { pipelineStage: candidate.pipelineStage },
        afterState: { pipelineStage },
      },
    })

    logger.info(`Candidate ${candidate.id} moved to ${pipelineStage}`)
    res.json({ success: true, data: updated })
  } catch (err) {
    logger.error('Update candidate status error', { err })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update status' } })
  }
})

// ── SAVE TO TALENT POOL ────────────────────────────────────────────────────────
candidatesRouter.post('/:id/save-to-pool', async (req: AuthRequest, res) => {
  try {
    const updated = await prisma.candidate.update({
      where: { id: req.params.id },
      data: { pipelineStage: 'held', deletionScheduledAt: null },
    })
    res.json({ success: true, data: { id: updated.id, pipelineStage: updated.pipelineStage } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save to pool' } })
  }
})

// ── GET TRANSCRIPT ────────────────────────────────────────────────────────────
candidatesRouter.get('/:id/transcript', async (req: AuthRequest, res) => {
  try {
    const messages = await prisma.screeningMessage.findMany({
      where: { candidateId: req.params.id, agencyId: req.user!.agencyId },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: { messages } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get transcript' } })
  }
})

// ── CV DIFF — returning candidate comparison ──────────────────────────────────
candidatesRouter.get('/:id/cv-diff', async (req: AuthRequest, res) => {
  try {
    const candidate = await prisma.candidate.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId },
    })
    if (!candidate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })

    const tags = candidate.dataTags as any
    const returning = tags?.returningCandidate

    if (!returning?.isReturning) {
      return res.json({ success: true, data: { isReturning: false } })
    }

    const whereClause: any[] = [{ waNumberHash: candidate.waNumberHash }]
    if (candidate.email) whereClause.push({ email: candidate.email })

    const previous = await prisma.candidate.findFirst({
      where: {
        agencyId: req.user!.agencyId,
        id: { not: candidate.id },
        OR: whereClause,
      },
      include: { job: { select: { title: true, hiringCompany: true } } },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      success: true,
      data: {
        isReturning: true,
        cvChangePercent: returning.cvChangePercent || 0,
        current: {
          skills: ((candidate.cvStructured as any)?.skills || []),
          experience: candidate.yearsExperience,
          currentRole: candidate.currentRole,
        },
        previous: previous ? {
          jobTitle: (previous.job as any)?.title,
          date: previous.createdAt.toISOString().split('T')[0],
          status: previous.pipelineStage,
          skills: ((previous.cvStructured as any)?.skills || []),
          experience: previous.yearsExperience,
          currentRole: previous.currentRole,
        } : null,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})
