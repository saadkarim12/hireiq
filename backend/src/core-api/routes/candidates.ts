// src/core-api/routes/candidates.ts
import { Router } from 'express'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logger } from '../../shared/logger'
import { io } from '../index'
import { computeRecommendationForCandidate, NEXT_STAGE_FOR } from '../../shared/recommendations'

// Forward order for detecting backward moves (earlier = earlier in recruiter flow)
const STAGE_ORDER: Record<string, number> = {
  applied: 0, screening: 1, cv_received: 1, evaluated: 1,
  shortlisted: 2, interviewing: 3, offered: 4, hired: 5,
  rejected: -1, withdrawn: -1, held: -1,
}

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
      // 7.7.a — remember which stage the recruiter rejected from, so the
      // candidate's WhatsApp status-query response can be stage-aware.
      updates.rejectedFromStage = candidate.pipelineStage
    }

    // 7.2.a / 7.3.a — When entering L1, synchronously mark conversationState as
    // screening_q1 BEFORE firing the async sim. Eliminates the race where a
    // fast post-PATCH refetch sees the pre-sim state and the "🔄 Screening…"
    // badge never renders. 8.5.b — only fire on genuine L1 entry, not on
    // backward drag from L2+ (which would re-run screening wastefully).
    const enteringL1 = pipelineStage === 'shortlisted'
      && ['applied', 'evaluated', 'screening'].includes(candidate.pipelineStage || '')
    if (enteringL1) {
      updates.conversationState = 'screening_q1'
    }

    // Append stage transition to audit history
    const prevStage = candidate.pipelineStage
    const historyEntry = {
      from: prevStage, to: pipelineStage,
      timestamp: new Date().toISOString(),
      userId: req.user!.id,
    }
    const existingHistory = Array.isArray((candidate as any).pipelineStageHistory)
      ? (candidate as any).pipelineStageHistory
      : []
    updates.pipelineStageHistory = [...existingHistory, historyEntry]

    // Flag backward moves in logs (not blocking)
    const fromIdx = STAGE_ORDER[prevStage] ?? 0
    const toIdx = STAGE_ORDER[pipelineStage] ?? 0
    if (toIdx >= 0 && fromIdx > toIdx) {
      logger.warn(`Backward stage move: candidate ${candidate.id} ${prevStage} → ${pipelineStage} by user ${req.user!.id}`)
    }

    // Clear the current recommendation (it was for the transition just taken) and
    // recompute for the new next-stage. Stubs return null for L2-L5 — frontend
    // will render a "Pending <next action>" badge based on pipelineStage.
    const candidateAfter = { ...candidate, ...updates, pipelineStage }
    const newRec = NEXT_STAGE_FOR[pipelineStage]
      ? computeRecommendationForCandidate(candidateAfter as any)
      : null
    updates.aiRecommendation       = newRec?.recommendation || null
    updates.aiRecommendationReason = newRec?.reason ? newRec.reason.slice(0, 500) : null
    updates.aiRecommendationStage  = newRec?.stage || null

    const updated = await prisma.candidate.update({ where: { id: req.params.id }, data: updates })

    // Emit real-time update
    io.to(`agency:${req.user!.agencyId}`).emit('candidate:updated', {
      candidateId: updated.id,
      jobId: updated.jobId,
      pipelineStage: updated.pipelineStage,
    })

    // Phase 6k: L1 entry triggers WhatsApp screening automatically.
    // Fire-and-forget: return immediately so the drag/click feels instant;
    // the sim runs async (~15-30s Claude calls) and the frontend polls /refetches
    // on the kanban to see composite scores appear when done.
    // conversationState='screening_q1' was already written synchronously above
    // (see 7.2.a/7.3.a) so the refetch immediately after this PATCH sees
    // in-progress state. 8.5.b gating on prevStage ∈ pre-screening stages
    // prevents re-running screening on backward drag from L2+.
    if (enteringL1) {
      logger.info(`L1 entry triggered for ${updated.id} — firing WhatsApp simulation async`)
      fetch(`http://localhost:${process.env.WHATSAPP_PORT || 3003}/mock/simulate-screening`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: updated.id }),
      }).catch(e => logger.warn('L1-entry simulation call failed', { err: e.message }))
    }

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

// 4.8.b — Application history: all candidates sharing waNumberHash OR email
// with the target candidate, within the same agency, excluding the target
// itself. Powers the Talent Pool drawer's "Application History" section.
candidatesRouter.get('/:id/history', async (req: AuthRequest, res: any) => {
  try {
    const target = await prisma.candidate.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId },
      select: { id: true, waNumberHash: true, email: true, agencyId: true },
    })
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } })

    const idMatchers: any[] = [{ waNumberHash: target.waNumberHash }]
    if (target.email) idMatchers.push({ email: target.email })

    const history = await prisma.candidate.findMany({
      where: {
        agencyId: target.agencyId,
        id: { not: target.id },
        OR: idMatchers,
      },
      select: {
        id: true, pipelineStage: true, compositeScore: true, cvMatchScore: true,
        createdAt: true,
        job: { select: { title: true, hiringCompany: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    res.json({
      success: true,
      data: history.map(h => ({
        id: h.id,
        jobTitle: h.job?.title || 'Unknown',
        hiringCompany: h.job?.hiringCompany || null,
        pipelineStage: h.pipelineStage,
        compositeScore: h.compositeScore,
        cvMatchScore: h.cvMatchScore,
        createdAt: h.createdAt,
      })),
    })
  } catch (err) {
    logger.error('Candidate history error', { err })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get history' } })
  }
})

// CV Download
candidatesRouter.get('/:id/cv-download', async (req: AuthRequest, res: any) => {
  try {
    const candidate = await prisma.candidate.findFirst({
      where: { id: req.params.id, agencyId: req.user!.agencyId }
    })
    if (!candidate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } })

    const cv = (candidate.cvStructured as any) || {}
    const name = candidate.fullName || 'Unknown'
    const role = candidate.currentRole || cv.currentRole || 'Unknown Role'
    const years = candidate.yearsExperience || cv.yearsExperienceTotal || 0
    const email = candidate.email || cv.email || ''
    const skills: string[] = cv.skills || []
    const score = candidate.compositeScore

    const cvLines: string[] = [
      name, role, '',
      `Contact: ${email} | Experience: ${years} years | Expected: AED ${(candidate.salaryExpectation || 0).toLocaleString() || 'Not specified'}/month`,
      `Source: ${candidate.sourceChannel || 'unknown'} | Added: ${candidate.createdAt?.toISOString().slice(0,10) || ''}`,
      score ? `HireIQ Score: ${score}/100` : '',
      '', 'SKILLS', '------',
      skills.join(' · ') || 'Not specified',
      '', 'PROFESSIONAL SUMMARY', '--------------------',
      cv.summary || `${name} is an experienced ${role} with ${years} years of industry experience.`,
      '',
    ]

    if (cv.experience && Array.isArray(cv.experience)) {
      cvLines.push('WORK EXPERIENCE', '---------------')
      for (const exp of cv.experience.slice(0, 5)) {
        cvLines.push(`${exp.title || exp.role || ''} - ${exp.company || ''}`)
        cvLines.push(exp.description || exp.desc || '')
        cvLines.push('')
      }
    }

    if (cv.education) {
      cvLines.push('EDUCATION', '---------')
      cvLines.push(typeof cv.education === 'string' ? cv.education : JSON.stringify(cv.education))
    }

    if (cv.certifications && Array.isArray(cv.certifications)) {
      cvLines.push('', 'CERTIFICATIONS', '--------------')
      for (const cert of cv.certifications) cvLines.push(`- ${cert}`)
    }

    cvLines.push('', '--- Generated by HireIQ ---')

    const textContent = cvLines.join('\n')
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}_CV.txt`

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.end(textContent)
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DOWNLOAD_ERROR', message: err.message } })
  }
})
