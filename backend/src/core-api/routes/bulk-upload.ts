// src/core-api/routes/bulk-upload.ts
import { Router, Response } from 'express'
import multer from 'multer'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logger } from '../../shared/logger'
import axios from 'axios'

export const bulkUploadRouter = Router()
bulkUploadRouter.use(requireAuth)

const AI_URL = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`

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

  res.json({ success: true, data: { queued: files.length, message: `Processing ${files.length} CVs. Check Talent Pool shortly.` } })

  let processed = 0, failed = 0, duplicates = 0
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

      if (cvStructured.email) {
        const exists = await prisma.candidate.findFirst({ where: { agencyId: req.user!.agencyId, email: cvStructured.email } })
        if (exists) { duplicates++; continue }
      }

      const crypto = require('crypto')
      const hash = crypto.createHash('sha256').update(cvStructured.email || cvStructured.phone || file.originalname + Date.now()).digest('hex')

      const jobRecord = jobId 
        ? await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, hiringCompany: true } })
        : await prisma.job.findFirst({ where: { agencyId: req.user!.agencyId }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, hiringCompany: true } })
      const defaultJob = jobRecord?.id
      if (!defaultJob) { failed++; continue }

      const candidate = await prisma.candidate.create({ data: {
        agencyId: req.user!.agencyId, jobId: defaultJob,
        waNumberHash: hash, waNumberEncrypted: cvStructured.phone ? Buffer.from(cvStructured.phone).toString('base64') : 'bulk_upload',
        fullName: cvStructured.fullName, email: cvStructured.email || null,
        currentRole: cvStructured.currentRole || null, yearsExperience: cvStructured.yearsExperienceTotal || null,
        cvStructured: JSON.parse(JSON.stringify(cvStructured).slice(0, 65000)) as any, cvType: 'full_cv',
        consentGiven: true, consentTimestamp: new Date(),
        sourceChannel: sourceChannel || 'bulk_upload',
        pipelineStage: 'applied', conversationState: 'completed',
        dataTags: JSON.parse(JSON.stringify({
          bulkUploaded: true, sourceChannel: sourceChannel || 'bulk_upload',
            jobTitle: jobRecord?.title || null, jobCompany: jobRecord?.hiringCompany || null,
          parseConfidence: cvStructured.parseConfidence || 70,
          seniorityLevel: (cvStructured.yearsExperienceTotal || 0) >= 8 ? 'Senior' : (cvStructured.yearsExperienceTotal || 0) >= 4 ? 'Mid-Level' : 'Junior',
        })),
        deletionScheduledAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      }})

      if (jobId) {
        axios.post(`${AI_URL}/api/v1/ai/score`, { candidateId: candidate.id, jobId }, { timeout: 60000 }).catch(() => {})
      }
      processed++
    } catch (err: any) {
      logger.error(`Bulk upload error: ${file.originalname}`, { err: err.message })
      failed++
    }
  }
  logger.info(`Bulk upload done: processed=${processed} failed=${failed} duplicates=${duplicates}`)
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
      orderBy: { compositeScore: 'desc' },
      take: 100,
    })
    res.json({ success: true, data: candidates, meta: { total: candidates.length } })
  } catch {
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
      orderBy: { compositeScore: 'desc' },
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

bulkUploadRouter.post('/jobs/:jobId/invite-from-pool', async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params
    const { candidateIds } = req.body
    if (!candidateIds?.length) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'No candidates selected' } })
    const job = await prisma.job.findFirst({ where: { id: jobId, agencyId: req.user!.agencyId } })
    if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } })

    let invited = 0
    for (const candidateId of candidateIds) {
      const c = await prisma.candidate.findFirst({ where: { id: candidateId, agencyId: req.user!.agencyId } })
      if (!c) continue
      const newCandidate = await prisma.candidate.create({ data: {
        agencyId: req.user!.agencyId, jobId,
        waNumberHash: (c.waNumberHash.slice(0, 50) + '_' + Date.now().toString().slice(-8)).slice(0, 64),
        waNumberEncrypted: c.waNumberEncrypted,
        fullName: c.fullName, email: c.email,
        currentRole: c.currentRole, yearsExperience: c.yearsExperience,
        cvStructured: c.cvStructured ? JSON.parse(JSON.stringify(c.cvStructured).slice(0, 50000)) : undefined,
        cvType: c.cvType || 'full_cv',
        consentGiven: true, consentTimestamp: new Date(),
        sourceChannel: 'talent_pool_match',
        // Phase 6k: Pool "Add to Pipeline" lands in Applied with CV-only scoring.
        // WhatsApp screening fires later when recruiter clicks "Invite to WhatsApp" in Applied drawer.
        pipelineStage: 'applied', conversationState: 'initiated',
        dataTags: JSON.parse(JSON.stringify({ ...(c.dataTags as any || {}), invitedFromPool: true, originalCandidateId: c.id, jobTitle: job.title }).slice(0, 30000)),
      }})

      // Fire CV-only scoring so the Applied drawer has a recommendation ready
      try {
        await fetch(`http://localhost:${process.env.AI_ENGINE_PORT || 3002}/api/v1/ai/score-cv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId: newCandidate.id, jobId }),
        })
      } catch (e) {
        logger.warn('CV-only scoring failed on pool invite — candidate landed in Applied without recommendation', { candidateId: newCandidate.id })
      }

      invited++
    }
    res.json({ success: true, data: { invited, jobTitle: job.title } })
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})
