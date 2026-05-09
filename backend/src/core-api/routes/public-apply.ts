// src/core-api/routes/public-apply.ts
// Public, unauthenticated job-application flow (v1.12.0).
// Each Job has an applicationToken; recruiters share the resulting URL.
// This router handles GET (job preview) + POST (CV submission with cheap
// hard-filter gate before any Claude spend). Mounted at /api/v1/public.
import { Router, Request, Response } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import axios from 'axios'
import { z } from 'zod'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'
import { io } from '../index'
import { applyHardFilter } from '../lib/cheap-filter'
import { detectFileKind, ACCEPTED_MIME_BY_KIND } from '../lib/file-validation'
import { honeypotGuard } from '../middleware/public-honeypot'
import { turnstileGuard } from '../middleware/public-turnstile'
import {
  publicGetLimit,
  publicSubmitHourLimit,
  publicSubmitDayLimit,
} from '../middleware/public-rate-limit'

export const publicApplyRouter = Router()

const AI_URL = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`

const upload = multer({
  storage: multer.memoryStorage(),
  // 5MB hard cap (matches spec). Multer rejects over-cap with MulterError
  // before our handler runs — caught in the error handler below.
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

// ── GET /public/jobs/:token ──────────────────────────────────────────────────
// Returns whitelisted public-safe fields for the apply page to render.
// 404 (with friendly code) for invalid / inactive / expired / non-active jobs.
publicApplyRouter.get('/jobs/:token', publicGetLimit, async (req: Request, res: Response) => {
  try {
    const token = (req.params.token || '').trim()
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(404).json({ success: false, error: { code: 'LINK_INVALID', message: 'This job is no longer accepting applications.' } })
    }

    const job = await prisma.job.findUnique({ where: { applicationToken: token } })
    if (!job || !job.isLinkActive || job.status !== 'active' ||
        (job.linkExpiresAt && job.linkExpiresAt < new Date())) {
      return res.status(404).json({ success: false, error: { code: 'LINK_INACTIVE', message: 'This job is no longer accepting applications.' } })
    }

    res.json({ success: true, data: {
      title: job.title,
      hiringCompany: job.hiringCompany,
      locationCity: job.locationCity,
      locationCountry: job.locationCountry,
      jobType: job.jobType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      currency: job.currency,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      requiredLanguages: job.requiredLanguages,
      minExperienceYears: job.minExperienceYears,
      jdText: job.jdText,
      screeningQuestions: job.screeningQuestions || [],
    }})
  } catch (err: any) {
    logger.error('public job fetch error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load job' } })
  }
})

// Body validation. Built before multer parses the file so we can validate
// after the multipart parser populates req.body. Numeric coercion handles
// FormData (everything arrives as string).
const SubmitSchema = z.object({
  fullName:        z.string().min(1).max(200).trim(),
  email:           z.string().email().max(320).transform(v => v.toLowerCase().trim()),
  phone:           z.string().max(30).optional().or(z.literal('')),
  linkedinUrl:     z.string().max(500).url().optional().or(z.literal('')),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  // screeningAnswers arrives as a JSON string in FormData; parse leniently.
  screeningAnswers: z.string().optional().transform((v, ctx) => {
    if (!v) return [] as { q: string; a: string }[]
    try {
      const parsed = JSON.parse(v)
      if (!Array.isArray(parsed)) throw new Error()
      return parsed.slice(0, 10).map((row: any) => ({
        q: String(row?.q ?? '').slice(0, 1000),
        a: String(row?.a ?? '').slice(0, 2000),
      }))
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid screeningAnswers' })
      return z.NEVER
    }
  }),
  consent: z.union([z.literal('true'), z.literal(true)]),
  hp_website: z.string().max(0).optional().or(z.literal('')),
  cf_turnstile_response: z.string().optional(),
})

// ── POST /public/jobs/:token/apply ───────────────────────────────────────────
// Multer first (file), then honeypot, then Turnstile, then handler. Order
// matters: cheap rejections come before any Claude spend or DB write.
publicApplyRouter.post(
  '/jobs/:token/apply',
  publicSubmitDayLimit,
  publicSubmitHourLimit,
  upload.single('cv'),
  honeypotGuard,
  turnstileGuard,
  async (req: Request, res: Response) => {
    const generic200 = () => res.status(200).json({ success: true, message: 'Application received' })
    try {
      const token = (req.params.token || '').trim()
      if (!/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(404).json({ success: false, error: { code: 'LINK_INVALID', message: 'This job is no longer accepting applications.' } })
      }

      // Validate the rest of the body.
      const parsed = SubmitSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'Please check the form and try again.', details: parsed.error.flatten().fieldErrors },
        })
      }
      const body = parsed.data

      // CV file required.
      const file = req.file
      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ success: false, error: { code: 'CV_REQUIRED', message: 'Please attach your CV.' } })
      }

      // Magic-byte sniff — rejects renamed executables, images, etc. Don't
      // trust file.mimetype (client-supplied). Filename extension is also
      // checked as a belt-and-braces hint for bot variations.
      const detected = detectFileKind(file.buffer)
      if (detected === 'unknown') {
        return res.status(400).json({ success: false, error: { code: 'BAD_FILE', message: 'CV must be a PDF, DOC or DOCX file.' } })
      }
      const ext = (file.originalname || '').toLowerCase().split('.').pop()
      if (!['pdf', 'doc', 'docx'].includes(ext || '')) {
        return res.status(400).json({ success: false, error: { code: 'BAD_FILE', message: 'CV must be a PDF, DOC or DOCX file.' } })
      }

      // Job lookup. 410 GONE for inactive — same friendly message as GET.
      const job = await prisma.job.findUnique({ where: { applicationToken: token } })
      if (!job || !job.isLinkActive || job.status !== 'active' ||
          (job.linkExpiresAt && job.linkExpiresAt < new Date())) {
        return res.status(410).json({ success: false, error: { code: 'LINK_INACTIVE', message: 'This job is no longer accepting applications.' } })
      }

      // Dupe check by (jobId, email). DB is source of truth — no cookies.
      const dupe = await prisma.candidate.findFirst({
        where: { jobId: job.id, email: body.email },
        select: { id: true },
      })
      if (dupe) {
        return res.status(409).json({
          success: false,
          error: { code: 'ALREADY_APPLIED', message: 'You have already applied to this position.' },
        })
      }

      // Extract text via the AI engine (same path bulk-upload uses).
      const base64 = file.buffer.toString('base64')
      const extractRes = await axios.post(`${AI_URL}/api/v1/ai/extract-text`,
        { base64, mimeType: ACCEPTED_MIME_BY_KIND[detected], filename: file.originalname },
        { timeout: 30000 },
      ).catch(() => null)
      const cvText = extractRes?.data?.data?.text || ''
      if (!cvText || cvText.length < 50) {
        // Don't reveal that parsing failed; give the candidate a generic retry.
        logger.warn('public apply: cv extraction failed', { token: token.slice(0, 8), bytes: file.buffer.length })
        return res.status(422).json({ success: false, error: { code: 'CV_UNREADABLE', message: 'We could not read your CV. Please re-export and try again.' } })
      }

      // Parse to structured fields (skills, years, etc).
      const parseRes = await axios.post(`${AI_URL}/api/v1/ai/parse-cv`,
        { candidateId: null, cvText, language: (cvText.match(/[؀-ۿ]/g) || []).length > 50 ? 'ar' : 'en' },
        { timeout: 30000 },
      ).catch(() => null)
      const cvStructured = parseRes?.data?.data
      if (!cvStructured) {
        logger.warn('public apply: cv parse failed', { token: token.slice(0, 8) })
        return res.status(422).json({ success: false, error: { code: 'CV_UNREADABLE', message: 'We could not read your CV. Please re-export and try again.' } })
      }

      // Form-supplied yearsExperience overrides the parsed one when the candidate
      // explicitly entered a number (parser sometimes underestimates).
      const yearsForFilter = Math.max(body.yearsExperience, cvStructured.yearsExperienceTotal || 0)

      // Cheap hard-filter — gates Claude scoring. Spam fails for free.
      const filterResult = applyHardFilter({
        job: { minExperienceYears: job.minExperienceYears, requiredSkills: job.requiredSkills || [] },
        parsedCv: { yearsExperienceTotal: yearsForFilter, skills: cvStructured.skills },
        cvText,
      })

      // Build the Candidate row. Both pass + fail get a row (auditable).
      const now = new Date()
      const phone = (body.phone || '').trim()
      // waNumberHash is VARCHAR(64). Hash phone if present, else random.
      const phoneSeed = phone || `${body.email}:${now.getTime()}:${crypto.randomBytes(8).toString('hex')}`
      const waHash = crypto.createHash('sha256').update(phoneSeed).digest('hex').slice(0, 64)
      const waEnc  = phone ? Buffer.from(phone).toString('base64') : 'public_link'

      const baseStageHistory: Array<Record<string, unknown>> = [{
        from: null,
        to: 'applied',
        timestamp: now.toISOString(),
        userId: null,
        entryPath: 'public_link',
      }]

      const data: any = {
        agencyId:          job.agencyId,
        jobId:             job.id,
        waNumberHash:      waHash,
        waNumberEncrypted: waEnc,
        fullName:          body.fullName.slice(0, 300),
        email:             body.email,
        currentRole:       (cvStructured.currentRole || null)?.slice?.(0, 300) ?? null,
        yearsExperience:   yearsForFilter,
        cvStructured:      JSON.parse(JSON.stringify(cvStructured).slice(0, 50000)),
        cvType:            'full_cv',
        consentGiven:      true,
        consentTimestamp:  now,
        sourceChannel:     'public_link',
        deletionScheduledAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        dataTags: JSON.parse(JSON.stringify({
          publicApply: true,
          linkedinUrl: (body.linkedinUrl || '').slice(0, 500) || null,
          screeningAnswers: body.screeningAnswers,
          submittedAt: now.toISOString(),
          ip: (req.ip || '').slice(0, 45),
        })),
      }

      if (filterResult.pass) {
        data.pipelineStage         = 'applied'
        data.hardFilterPass        = true
        data.conversationState     = 'completed'
        data.pipelineStageHistory  = JSON.parse(JSON.stringify(baseStageHistory))
      } else {
        data.pipelineStage         = 'rejected'
        data.hardFilterPass        = false
        data.hardFilterFailReason  = filterResult.reason
        data.rejectedFromStage     = 'applied'
        data.rejectionReason       = 'auto_filter'
        data.conversationState     = 'completed'
        data.pipelineStageHistory  = JSON.parse(JSON.stringify([
          ...baseStageHistory,
          { from: 'applied', to: 'rejected', timestamp: now.toISOString(), userId: null, reason: 'auto_filter' },
        ]))
      }

      const candidate = await prisma.candidate.create({ data })

      // Live socket update so the recruiter dashboard sees it without a refresh.
      try { io.to(`agency:${job.agencyId}`).emit('candidate:created', { candidateId: candidate.id, jobId: job.id }) } catch {}

      // Fire async Claude scoring ONLY for filter-pass rows. Rejected rows
      // already have a definitive reason; spending Claude on them is waste.
      if (filterResult.pass) {
        axios.post(`${AI_URL}/api/v1/ai/score-cv`, { candidateId: candidate.id, jobId: job.id }, { timeout: 60000 })
          .catch(e => logger.warn('public apply: async score-cv failed', { candidateId: candidate.id, err: e?.message }))
      }

      logger.info('public apply submitted', {
        token: token.slice(0, 8),
        jobId: job.id,
        candidateId: candidate.id,
        passedFilter: filterResult.pass,
      })

      // ALWAYS generic — never reveal pass/fail to the candidate.
      return generic200()
    } catch (err: any) {
      // Multer file-too-large surfaces here.
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'CV must be 5 MB or smaller.' } })
      }
      logger.error('public apply error', { err: err?.message, stack: err?.stack?.split('\n').slice(0, 3).join(' | ') })
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again shortly.' } })
    }
  },
)
