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

      const defaultJob = jobId || await prisma.job.findFirst({ where: { agencyId: req.user!.agencyId }, orderBy: { createdAt: 'desc' } }).then(j => j?.id)
      if (!defaultJob) { failed++; continue }

      const candidate = await prisma.candidate.create({ data: {
        agencyId: req.user!.agencyId, jobId: defaultJob,
        waNumberHash: hash, waNumberEncrypted: cvStructured.phone ? Buffer.from(cvStructured.phone).toString('base64') : 'bulk_upload',
        fullName: cvStructured.fullName, email: cvStructured.email || null,
        currentRole: cvStructured.currentRole || null, yearsExperience: cvStructured.yearsExperienceTotal || null,
        cvStructured: cvStructured, cvType: 'full_cv',
        consentGiven: true, consentTimestamp: new Date(),
        sourceChannel: sourceChannel || 'bulk_upload',
        pipelineStage: 'applied', conversationState: 'completed',
        dataTags: JSON.parse(JSON.stringify({
          bulkUploaded: true, sourceChannel: sourceChannel || 'bulk_upload',
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
        pipelineStage: { notIn: ['rejected'] },
        ...(q ? { OR: [
          { fullName: { contains: q as string, mode: 'insensitive' } },
          { currentRole: { contains: q as string, mode: 'insensitive' } },
        ]} : {}),
        ...(source ? { sourceChannel: source as string } : {}),
        ...(minScore ? { compositeScore: { gte: parseInt(minScore as string) } } : {}),
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

    const matches = await prisma.candidate.findMany({
      where: {
        agencyId: req.user!.agencyId,
        compositeScore: { gte: threshold },
        pipelineStage: { notIn: ['rejected'] },
        NOT: { OR: [
          ...(existingEmails.length ? [{ email: { in: existingEmails } }] : []),
          { waNumberHash: { in: existingHashes } },
        ]},
      },
      orderBy: { compositeScore: 'desc' },
      take: 30,
    })
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
      await prisma.candidate.create({ data: {
        agencyId: req.user!.agencyId, jobId,
        waNumberHash: c.waNumberHash + '_' + Date.now(),
        waNumberEncrypted: c.waNumberEncrypted,
        fullName: c.fullName, email: c.email,
        currentRole: c.currentRole, yearsExperience: c.yearsExperience,
        cvStructured: c.cvStructured || undefined,
        cvType: c.cvType || 'full_cv',
        consentGiven: true, consentTimestamp: new Date(),
        sourceChannel: 'talent_pool_match',
        pipelineStage: 'applied', conversationState: 'initiated',
        dataTags: JSON.parse(JSON.stringify({ ...(c.dataTags as any || {}), invitedFromPool: true, originalCandidateId: c.id })),
      }})
      invited++
    }
    res.json({ success: true, data: { invited, jobTitle: job.title } })
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } })
  }
})
