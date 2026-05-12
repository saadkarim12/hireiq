// src/core-api/routes/bulk-upload.ts
import { Router, Response } from 'express'
import multer from 'multer'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logger } from '../../shared/logger'
import { fillContactFromHistory } from '../lib/contact-reuse'
import axios from 'axios'

export const bulkUploadRouter = Router()
bulkUploadRouter.use(requireAuth)

const AI_URL = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`

// Claude returns sentinel strings like `<UNKNOWN>` when it can't extract a
// field. Treat anything that isn't a real-looking email as missing — otherwise
// a single bad row poisons dedupe for every future no-email upload.
function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^<?unknown>?$/i.test(trimmed)) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed.toLowerCase()
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
  fileFilter: (_req, file, cb) => {
    const ok = ['application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported file'))
  },
})

bulkUploadRouter.post('/bulk-upload', upload.array('cvFiles', 50), async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[]
  const { sourceChannel, jobId, pdplConsent } = req.body

  if (pdplConsent !== 'true')
    return res.status(400).json({ success: false, error: { code: 'CONSENT_REQUIRED', message: 'PDPL consent required' } })
  if (!files?.length)
    return res.status(400).json({ success: false, error: { code: 'NO_FILES', message: 'No files uploaded' } })

  // Archived jobs do not accept new uploads. Check up-front so the recruiter
  // gets immediate feedback rather than discovering it via empty Talent Pool.
  if (jobId) {
    const targetJob = await prisma.job.findFirst({
      where: { id: jobId, agencyId: req.user!.agencyId },
      select: { status: true },
    })
    if (!targetJob) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })
    }
    if (targetJob.status === 'archived') {
      return res.status(409).json({ success: false, error: { code: 'JOB_ARCHIVED', message: 'This job is archived and cannot accept new applications.' } })
    }
  }

  res.json({ success: true, data: { queued: files.length, message: `Processing ${files.length} CVs. Check Talent Pool shortly.` } })

  let processed = 0, failed = 0, duplicates = 0, reopened = 0
  for (const file of files) {
    try {
      const base64 = file.buffer.toString('base64')
      const extractRes = await axios.post(`${AI_URL}/api/v1/ai/extract-text`,
        { base64, mimeType: file.mimetype, filename: file.originalname },
        { timeout: 30000 }
      ).catch(() => null)
      const cvText = extractRes?.data?.data?.text || file.buffer.toString('utf-8', 0, 5000).replace(/[^\x20-\x7E\n\r\t\u0600-\u06FF]/g, ' ')
      if (!cvText || cvText.length < 50) { failed++; continue }

      const parseRes = await axios.post(`${AI_URL}/api/v1/ai/parse-cv`,
        { candidateId: null, cvText, language: (cvText.match(/[\u0600-\u06FF]/g)||[]).length > 50 ? 'ar' : 'en' },
        { timeout: 30000 }
      ).catch(() => null)
      const cvStructured = parseRes?.data?.data
      if (!cvStructured?.fullName) { failed++; continue }

      const normalizedEmail = normalizeEmail(cvStructured.email)
      const normalizedPhone = typeof cvStructured.phone === 'string' ? cvStructured.phone.trim().slice(0, 30) : null

      // Decide the target job FIRST, then dedup against (agencyId, jobId, email).
      // v1.13.0: same identity to a DIFFERENT job is allowed and creates a new
      // Candidate row. Dedup only fires for same person applying to same job.
      const jobRecord = jobId
        ? await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, hiringCompany: true } })
        : await prisma.job.findFirst({
            where: { agencyId: req.user!.agencyId, status: { not: 'archived' } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, title: true, hiringCompany: true },
          })
      const targetJobId = jobRecord?.id
      if (!targetJobId) { failed++; continue }

      if (normalizedEmail) {
        const exists = await prisma.candidate.findFirst({
          where: { agencyId: req.user!.agencyId, jobId: targetJobId, email: normalizedEmail },
        })
        if (exists) {
          if (exists.pipelineStage === 'rejected') {
            const prevHistory = Array.isArray(exists.pipelineStageHistory) ? (exists.pipelineStageHistory as any[]) : []
            await prisma.candidate.update({
              where: { id: exists.id },
              data: {
                pipelineStage: 'applied',
                rejectedFromStage: null,
                rejectionReason: null,
                hardFilterPass: null,
                hardFilterFailReason: null,
                skillsScore: null,
                experienceScore: null,
                cvScreeningScore: null,
                cvMatchScore: null,
                scoringAttempts: 0,
                conversationState: 'completed',
                aiRecommendation: null,
                aiRecommendationReason: null,
                aiRecommendationStage: null,
                currentRole: cvStructured.currentRole || exists.currentRole,
                yearsExperience: cvStructured.yearsExperienceTotal ?? exists.yearsExperience,
                phoneNumber: normalizedPhone || exists.phoneNumber,
                cvStructured: JSON.parse(JSON.stringify(cvStructured).slice(0, 65000)) as any,
                createdAt: new Date(),
                deletionScheduledAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                pipelineStageHistory: JSON.parse(JSON.stringify([...prevHistory, {
                  from: 'rejected',
                  to: 'applied',
                  timestamp: new Date().toISOString(),
                  userId: req.user!.id,
                  entryPath: 'cv_inbox_reupload',
                }])) as any,
              },
            })
            axios.post(`${AI_URL}/api/v1/ai/score-cv`, { candidateId: exists.id, jobId: targetJobId }, { timeout: 60000 }).catch(() => {})
            reopened++
            continue
          }
          duplicates++; continue
        }
      }

      const crypto = require('crypto')
      const hash = crypto.createHash('sha256').update(normalizedEmail || normalizedPhone || file.originalname + Date.now()).digest('hex')

      const reused = await fillContactFromHistory(req.user!.agencyId, {
        fullName:     cvStructured.fullName,
        email:        normalizedEmail,
        phoneNumber:  normalizedPhone,
        waNumberHash: hash,
      })

      const candidate = await prisma.candidate.create({ data: {
        agencyId: req.user!.agencyId, jobId: targetJobId,
        waNumberHash: hash, waNumberEncrypted: normalizedPhone ? Buffer.from(normalizedPhone).toString('base64') : 'bulk_upload',
        fullName: reused.fullName || cvStructured.fullName, email: normalizedEmail,
        phoneNumber: reused.phoneNumber,
        currentRole: cvStructured.currentRole || null, yearsExperience: cvStructured.yearsExperienceTotal || null,
        cvStructured: JSON.parse(JSON.stringify(cvStructured).slice(0, 65000)) as any, cvType: 'full_cv',
        consentGiven: true, consentTimestamp: new Date(),
        sourceChannel: sourceChannel || 'bulk_upload',
        pipelineStage: 'applied', conversationState: 'completed',
        pipelineStageHistory: JSON.parse(JSON.stringify([{
          from: null,
          to: 'applied',
          timestamp: new Date().toISOString(),
          userId: req.user!.id,
          entryPath: 'cv_inbox',
        }])),
        dataTags: JSON.parse(JSON.stringify({
          bulkUploaded: true, sourceChannel: sourceChannel || 'bulk_upload',
            jobTitle: jobRecord?.title || null, jobCompany: jobRecord?.hiringCompany || null,
          parseConfidence: cvStructured.parseConfidence || 70,
          seniorityLevel: (cvStructured.yearsExperienceTotal || 0) >= 8 ? 'Senior' : (cvStructured.yearsExperienceTotal || 0) >= 4 ? 'Mid-Level' : 'Junior',
        })),
        deletionScheduledAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      }})

      axios.post(`${AI_URL}/api/v1/ai/score-cv`, { candidateId: candidate.id, jobId: targetJobId }, { timeout: 60000 }).catch(() => {})
      processed++
    } catch (err: any) {
      logger.error(`Bulk upload error: ${file.originalname}`, { err: err.message })
      failed++
    }
  }
  logger.info(`Bulk upload done: processed=${processed} reopened=${reopened} failed=${failed} duplicates=${duplicates}`)
})

bulkUploadRouter.get('/talent-pool/search', async (req: AuthRequest, res: Response) => {
  try {
    const { q, source, minScore, maxDays = '90' } = req.query
    const cutoff = new Date(Date.now() - parseInt(maxDays as string) * 24 * 60 * 60 * 1000)
    const candidates = await prisma.candidate.findMany({
      where: {
        agencyId: req.user!.agencyId,
        createdAt: { gte: cutoff },
        // pipelineStage filter removed — frontend handles display logic
        ...(q ? { OR: [
          { fullName: { contains: q as string, mode: 'insensitive' } },
          { currentRole: { contains: q as string, mode: 'insensitive' } },
        ]} : {}),
        ...(source ? { sourceChannel: source as string } : {}),
        ...(minScore && parseInt(minScore as string) > 0 ? { compositeScore: { gte: parseInt(minScore as string) } } : {}),
      },
      orderBy: [
        { compositeScore: { sort: 'desc', nulls: 'last' } },
        { cvMatchScore:   { sort: 'desc', nulls: 'last' } },
      ],
      take: 200,  // fetch more; dedupe may shrink the set
    })

    // 7.6.a.iii — Collapse rows by identity. A person who applied to 3 jobs
    // has 3 Candidate rows sharing waNumberHash (and usually email). Show one
    // row per unique person in Talent Pool — latest application wins for the
    // display fields, but we annotate with applicationCount for context.
    const byKey = new Map<string, any>()
    for (const c of candidates) {
      // Prefer email as the dedupe key when available; fall back to waNumberHash.
      const key = (c.email || `wa:${c.waNumberHash}`).toLowerCase()
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { ...c, applicationCount: 1, bestCompositeScore: c.compositeScore })
      } else {
        existing.applicationCount += 1
        // Prefer the row with the highest compositeScore for display; keep
        // the best score separately so UI can flag "best of N applications".
        if ((c.compositeScore || 0) > (existing.bestCompositeScore || 0)) {
          existing.bestCompositeScore = c.compositeScore
        }
        // Keep the most-recent row as the canonical record
        if (new Date(c.createdAt) > new Date(existing.createdAt)) {
          byKey.set(key, { ...c, applicationCount: existing.applicationCount, bestCompositeScore: existing.bestCompositeScore })
        }
      }
    }
    const deduped = Array.from(byKey.values())
      .sort((a, b) => (b.bestCompositeScore || 0) - (a.bestCompositeScore || 0))
      .slice(0, 100)

    res.json({ success: true, data: deduped, meta: { total: deduped.length, beforeDedupe: candidates.length } })
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})

// ── CV Inbox listing — unified list (v1.13.0) ─────────────────────────────────
// One row per (jobId, person). NOT deduped — same person to two jobs shows up
// twice, intentionally. status=all returns accepted + rejected in one call.
bulkUploadRouter.get('/cv-inbox', async (req: AuthRequest, res: Response) => {
  try {
    const statusParam = (req.query.status as string) || 'all'
    const status =
      statusParam === 'rejected' ? 'rejected' :
      statusParam === 'accepted' ? 'accepted' : 'all'
    const maxDays = Math.min(parseInt((req.query.maxDays as string) || '7') || 7, 90)
    const jobId   = (req.query.jobId as string) || undefined
    const cutoff  = new Date(Date.now() - maxDays * 86400000)

    const stageFilter: any =
      status === 'rejected' ? { pipelineStage: 'rejected' } :
      status === 'accepted' ? { pipelineStage: { in: ['applied', 'evaluated', 'shortlisted', 'interviewing', 'offered', 'hired'] } } :
      {}

    const candidates = await prisma.candidate.findMany({
      where: {
        agencyId:   req.user!.agencyId,
        createdAt:  { gte: cutoff },
        ...stageFilter,
        ...(jobId ? { jobId } : {}),
      },
      orderBy: [
        { cvScreeningScore: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: 200,
      select: {
        id: true, fullName: true, email: true, phoneNumber: true,
        currentRole: true, yearsExperience: true,
        cvScreeningScore: true, skillsScore: true, experienceScore: true,
        cvMatchScore: true, hardFilterPass: true, hardFilterFailReason: true,
        pipelineStage: true, rejectionReason: true, rejectedFromStage: true,
        aiRecommendation: true, aiRecommendationReason: true,
        scoringAttempts: true, sourceChannel: true, createdAt: true,
        dataTags: true, jobId: true,
        job: { select: { title: true, hiringCompany: true } },
      },
    })

    res.json({ success: true, data: candidates, meta: { total: candidates.length, status } })
  } catch (err: any) {
    logger.error('CV inbox list error', { err: err?.message })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})

bulkUploadRouter.get('/jobs/:jobId/talent-matches', async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params
    const threshold = parseInt(req.query.threshold as string || '55')
    const job = await prisma.job.findFirst({ where: { id: jobId, agencyId: req.user!.agencyId } })
    if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })

    const inJob = await prisma.candidate.findMany({ where: { jobId }, select: { email: true, waNumberHash: true } })
    const existingEmails = inJob.map(c => c.email).filter(Boolean) as string[]
    const existingHashes = inJob.map(c => c.waNumberHash)

    // Get all pool candidates not already in this job
    const allCandidates = await prisma.candidate.findMany({
      where: {
        agencyId: req.user!.agencyId,
        fullName: { not: null },
        NOT: [
          { fullName: '<UNKNOWN>' },
          { fullName: 'UNKNOWN' },
          { OR: [
            ...(existingEmails.length ? [{ email: { in: existingEmails } }] : []),
            ...(existingHashes.length ? [{ waNumberHash: { in: existingHashes } }] : []),
          ]},
        ],
      },
      orderBy: [
        { compositeScore: { sort: 'desc', nulls: 'last' } },
        { cvMatchScore:   { sort: 'desc', nulls: 'last' } },
      ],
      take: 100,
    })

    // 4.4.a — Match algorithm rewrite. Required and preferred skills are
    // weighted separately; a hard gate keeps candidates who don't actually
    // match the non-negotiables (required skills) out of the result set.
    // Cross-job compositeScore from previous applications no longer biases
    // the match — each job gets a fresh score based on this job's skills only.
    // String matching is restricted to the candidate's declared cvSkills[];
    // we no longer scan the raw cvStructured JSON body (which produced false
    // positives from historical project descriptions).
    const requiredSkills: string[] = (job as any).requiredSkills || []
    const preferredSkills: string[] = (job as any).preferredSkills || []

    // TODO: Phase 8 — adaptive threshold based on must-have count
    //   1-3 must-haves → 100% match required (small deliberate list)
    //   4-6 must-haves → 66%  match required (typical list)
    //   7+  must-haves → 50%  match required (likely bloated list)
    const HARD_GATE_THRESHOLD = 0.5

    const skillInCv = (skill: string, cvSkills: string[]) =>
      cvSkills.some(s => s.toLowerCase().includes(skill.toLowerCase()))

    const matches = allCandidates
      .map(c => {
        const cvSkills: string[] = (c.cvStructured as any)?.skills || []

        const requiredEvidence = requiredSkills.map(skill => ({
          skill, found: skillInCv(skill, cvSkills)
        }))
        const preferredEvidence = preferredSkills.map(skill => ({
          skill, found: skillInCv(skill, cvSkills)
        }))

        const requiredMatches = requiredEvidence.filter(e => e.found).length
        const preferredMatches = preferredEvidence.filter(e => e.found).length

        const requiredPct = requiredSkills.length > 0 ? requiredMatches / requiredSkills.length : 1
        const preferredPct = preferredSkills.length > 0 ? preferredMatches / preferredSkills.length : 0

        // Hard gate: drop candidates who don't meet the required-skill threshold.
        // If the job has no required skills, skip the gate entirely.
        if (requiredSkills.length > 0 && requiredPct < HARD_GATE_THRESHOLD) {
          return null
        }

        // Scoring: required skills carry 70%, preferred 30%.
        const skillScore = Math.round(requiredPct * 70 + preferredPct * 30)

        return {
          ...c,
          compositeScore: skillScore,
          dataTags: {
            ...(c.dataTags as any || {}),
            evidence: { mustHaveSkills: [...requiredEvidence, ...preferredEvidence] },
          }
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.compositeScore >= threshold)
      .sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0))
      .slice(0, 30)

    res.json({ success: true, data: { matches, jobTitle: job.title, totalMatches: matches.length, threshold } })
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})

// Preview-score a pool candidate against an arbitrary job. No DB write.
// Talent Pool drawer uses this when a job is selected via "Match to Job".
bulkUploadRouter.post('/jobs/:jobId/preview-score', async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params
    const { candidateId } = req.body
    if (!candidateId) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'candidateId required' } })
    const job = await prisma.job.findFirst({ where: { id: jobId, agencyId: req.user!.agencyId } })
    if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })
    const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, agencyId: req.user!.agencyId } })
    if (!candidate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } })

    const aiRes = await axios.post(`${AI_URL}/api/v1/ai/preview-score-cv`, { candidateId, jobId }, { timeout: 60000 })
    res.json({ success: true, data: aiRes.data?.data })
  } catch (err: any) {
    logger.error('Preview-score error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to preview-score' } })
  }
})

bulkUploadRouter.post('/jobs/:jobId/invite-from-pool', async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params
    const { candidateIds, approveToL1 = false } = req.body as { candidateIds: string[]; approveToL1?: boolean }
    if (!candidateIds?.length) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'No candidates selected' } })
    const job = await prisma.job.findFirst({ where: { id: jobId, agencyId: req.user!.agencyId } })
    if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })
    if (job.status === 'archived') {
      return res.status(409).json({ success: false, error: { code: 'JOB_ARCHIVED', message: 'This job is archived and cannot accept new applications.' } })
    }

    const targetStage = approveToL1 ? 'shortlisted' : 'applied'
    const now = new Date().toISOString()

    let invited = 0
    const skipped: Array<{ candidateId: string; existingId: string; fullName: string | null }> = []
    for (const candidateId of candidateIds) {
      const c = await prisma.candidate.findFirst({ where: { id: candidateId, agencyId: req.user!.agencyId } })
      if (!c) continue

      const baseHash = c.waNumberHash.split('_')[0]
      const existing = await prisma.candidate.findFirst({
        where: {
          jobId,
          OR: [
            ...(c.email ? [{ email: c.email }] : []),
            { waNumberHash: { startsWith: baseHash } },
          ],
        },
        select: { id: true },
      })
      if (existing) {
        skipped.push({ candidateId, existingId: existing.id, fullName: c.fullName })
        continue
      }

      const newCandidate = await prisma.candidate.create({ data: {
        agencyId: req.user!.agencyId, jobId,
        waNumberHash: c.waNumberHash.slice(0, 64),
        waNumberEncrypted: c.waNumberEncrypted,
        fullName: c.fullName, email: c.email,
        currentRole: c.currentRole, yearsExperience: c.yearsExperience,
        cvStructured: c.cvStructured ? JSON.parse(JSON.stringify(c.cvStructured).slice(0, 50000)) : undefined,
        cvType: c.cvType || 'full_cv',
        consentGiven: true, consentTimestamp: new Date(),
        sourceChannel: 'talent_pool_match',
        pipelineStage: targetStage,
        // When approveToL1, write screening_q1 synchronously before async sim
        // (mirrors the race-fix pattern in candidates.ts PATCH /:id/status).
        conversationState: approveToL1 ? 'screening_q1' : 'initiated',
        shortlistedAt: approveToL1 ? new Date() : null,
        pipelineStageHistory: JSON.parse(JSON.stringify([{
          from: null,
          to: targetStage,
          timestamp: now,
          userId: req.user!.id,
          entryPath: 'tp_direct',
        }])),
        dataTags: JSON.parse(JSON.stringify({ ...(c.dataTags as any || {}), invitedFromPool: true, originalCandidateId: c.id, jobTitle: job.title }).slice(0, 30000)),
      }})

      // Score-CV for both paths so the drawer has a recommendation.
      try {
        await fetch(`${AI_URL}/api/v1/ai/score-cv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId: newCandidate.id, jobId }),
        })
      } catch (e) {
        logger.warn('CV-only scoring failed on pool invite', { candidateId: newCandidate.id })
      }

      // approveToL1 path: fire WhatsApp screening simulation (same as Applied → L1 today).
      if (approveToL1) {
        try {
          fetch(`http://localhost:${process.env.WHATSAPP_PORT || 3003}/api/v1/whatsapp/simulate-screening`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateId: newCandidate.id, jobId }),
          }).catch(() => {})
        } catch {}
      }

      invited++
    }
    res.json({ success: true, data: { invited, skipped, jobTitle: job.title, targetStage } })
  } catch (err: any) {
    logger.error('invite-from-pool error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})
