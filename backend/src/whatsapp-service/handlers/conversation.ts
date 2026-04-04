// src/whatsapp-service/handlers/conversation.ts
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'
import { sendMessage } from './send'
import axios from 'axios'

const AI_URL   = `http://localhost:${process.env.AI_ENGINE_PORT || 3002}`
const CORE_URL = `http://localhost:${process.env.CORE_API_PORT || 3001}`

// ── BILINGUAL MESSAGES ────────────────────────────────────────────────────────
const MSG = {
  welcome: (company: string) =>
    `مرحباً بك في ${company}! 🌟\nWelcome to ${company}! 🌟\n\nاضغط *1* للعربية\nPress *2* for English`,

  consentAr: (company: string) =>
    `شكراً! قبل المتابعة، نحتاج موافقتك على معالجة بياناتك الشخصية بواسطة ${company} لأغراض التوظيف.\n\nاكتب *نعم* للموافقة والمتابعة.\n_يمكنك طلب حذف بياناتك في أي وقت._`,

  consentEn: (company: string) =>
    `Thank you! Before we continue, we need your consent to process your personal data with ${company} for recruitment purposes.\n\nType *YES* to agree and continue.\n_You can request deletion of your data at any time._`,

  thankYouAr: (role: string, company: string) =>
    `ممتاز! سنبدأ الآن بالأسئلة لوظيفة *${role}* في *${company}*.\n\nالأسئلة قصيرة وستأخذ حوالي 5 دقائق فقط. 👇`,

  thankYouEn: (role: string, company: string) =>
    `Great! Let's start with a few quick questions for the *${role}* position at *${company}*.\n\nThis takes about 5 minutes. 👇`,

  cvRequestAr: () =>
    `شكراً على إجاباتك! الآن، أرسل لنا سيرتك الذاتية (PDF أو Word).\n\nإذا لم يكن لديك سيرة ذاتية، اكتب *لا يوجد* وسنجمع بياناتك من خلال المحادثة.`,

  cvRequestEn: () =>
    `Thanks for your answers! Now please send your CV (PDF or Word document).\n\nIf you don't have a CV ready, type *NO CV* and we'll collect your profile through a quick conversation.`,

  processingAr: () =>
    `✅ تم استلام بياناتك! نحن نراجع ملفك الآن.\n\nسيتواصل معك الفريق خلال 24-48 ساعة.\n\nيمكنك كتابة *حالة* في أي وقت لمعرفة مستجدات طلبك.`,

  processingEn: () =>
    `✅ We've received your application! Our team is reviewing your profile.\n\nYou'll hear back within 24-48 hours.\n\nType *status* at any time to check your application status.`,

  statusAr: (stage: string) => {
    const stages: Record<string, string> = {
      applied: 'طلبك قيد المراجعة',
      screening: 'جارٍ تقييم طلبك',
      shortlisted: '🌟 تهانينا! أنت في القائمة المختصرة',
      interviewing: '📅 سيتم التواصل معك لتحديد موعد المقابلة',
      rejected: 'نعتذر، تم اختيار مرشحين آخرين لهذا الدور',
      hired: '🎉 مبروك! تم قبولك',
    }
    return `حالة طلبك: ${stages[stage] || 'قيد المراجعة'}`
  },

  statusEn: (stage: string) => {
    const stages: Record<string, string> = {
      applied: 'Your application is under review',
      screening: 'Your application is being evaluated',
      shortlisted: '🌟 Congratulations! You have been shortlisted',
      interviewing: '📅 You will be contacted to schedule an interview',
      rejected: 'We regret that other candidates were selected for this role',
      hired: '🎉 Congratulations! You have been selected',
    }
    return `Application status: ${stages[stage] || 'Under review'}`
  },

  slotsRequestAr: () =>
    `مبروك على وصولك للمرحلة التالية! 🎉\n\nيرجى إرسال 3 أوقات مناسبة لك للمقابلة خلال الأسبوع القادم.\n\nمثال: الأحد 15 يناير 10 صباحاً، الاثنين 16 يناير 2 ظهراً`,

  slotsRequestEn: () =>
    `Congratulations on reaching the next stage! 🎉\n\nPlease suggest 3 available time slots for an interview in the next week.\n\nExample: Sunday Jan 15 at 10am, Monday Jan 16 at 2pm`,
}

// ── MAIN CONVERSATION HANDLER ─────────────────────────────────────────────────
export async function handleIncomingMessage(params: {
  waNumber: string
  message: string
  mediaUrl?: string
  agencyId: string
  agencyName: string
  jobShortcode?: string
}) {
  const { waNumber, message, mediaUrl, agencyId, agencyName } = params
  const msgLower = message.toLowerCase().trim()

  // Hash the WhatsApp number for lookup
  const crypto = require('crypto')
  const waHash = crypto.createHash('sha256').update(waNumber).digest('hex')

  logger.debug(`Incoming message from ${waHash.slice(0, 8)}...: "${message.slice(0, 50)}"`)

  // ── STATUS CHECK (any stage) ───────────────────────────────────────────────
  if (msgLower === 'status' || msgLower === 'حالة' || msgLower === 'حالة طلبي') {
    const candidate = await prisma.candidate.findFirst({
      where: { waNumberHash: waHash, agencyId },
      orderBy: { createdAt: 'desc' },
    })
    if (candidate) {
      const lang = candidate.preferredLanguage || 'en'
      const msg  = lang === 'ar'
        ? MSG.statusAr(candidate.pipelineStage)
        : MSG.statusEn(candidate.pipelineStage)
      await sendMessage({ agencyId, waNumber, message: msg })
      return
    }
  }

  // ── FIND ACTIVE CANDIDATE SESSION ─────────────────────────────────────────
  let candidate = await prisma.candidate.findFirst({
    where: {
      waNumberHash: waHash,
      agencyId,
      pipelineStage: { notIn: ['hired', 'rejected'] },
      conversationState: { notIn: ['completed', 'timeout'] },
    },
    include: { job: true },
    orderBy: { createdAt: 'desc' },
  })

  // ── NEW APPLICATION ────────────────────────────────────────────────────────
  if (!candidate && params.jobShortcode) {
    const job = await prisma.job.findFirst({
      where: { waShortcode: params.jobShortcode, agencyId, status: 'active' },
    })

    if (!job) {
      await sendMessage({ agencyId, waNumber, message: 'This job posting is no longer active. Thank you for your interest.' })
      return
    }

    // Create new candidate session
    candidate = await prisma.candidate.create({
      data: {
        agencyId,
        jobId: job.id,
        waNumberHash: waHash,
        waNumberEncrypted: Buffer.from(waNumber).toString('base64'),
        conversationState: 'language_selection',
        pipelineStage: 'applied',
        sourceChannel: 'whatsapp',
      },
      include: { job: true },
    })

    // Send welcome message
    await sendMessage({ agencyId, waNumber, message: MSG.welcome(agencyName) })

    // Log message
    await logMessage(candidate.id, agencyId, 'outbound', 'greeting', MSG.welcome(agencyName))
    return
  }

  if (!candidate) {
    await sendMessage({ agencyId, waNumber, message: `Hi! To apply for a job, please use the apply link provided by the recruiter. Type *status* to check an existing application.` })
    return
  }

  const job = (candidate as any).job

  // ── STATE MACHINE ──────────────────────────────────────────────────────────
  const state = candidate.conversationState

  // Log incoming message
  await logMessage(candidate.id, agencyId, 'inbound', 'candidate_reply', message)

  switch (state) {

    case 'language_selection': {
      const isArabic = message.trim() === '1' || message.includes('عربي') || message.includes('arabic')
      const lang     = isArabic ? 'ar' : 'en'

      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { preferredLanguage: lang, conversationState: 'consent_pending' },
      })

      const consentMsg = lang === 'ar'
        ? MSG.consentAr(agencyName)
        : MSG.consentEn(agencyName)

      await sendMessage({ agencyId, waNumber, message: consentMsg })
      await logMessage(candidate.id, agencyId, 'outbound', 'consent', consentMsg)
      break
    }

    case 'consent_pending': {
      const consented = ['yes','نعم','ok','agree','موافق'].some(w => msgLower.includes(w))
      if (!consented) {
        const retry = candidate.preferredLanguage === 'ar'
          ? 'يرجى كتابة *نعم* للموافقة والمتابعة.'
          : 'Please type *YES* to agree and continue.'
        await sendMessage({ agencyId, waNumber, message: retry })
        return
      }

      // Record consent
      const now = new Date()
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          consentGiven: true,
          consentTimestamp: now,
          conversationState: 'screening_q1',
        },
      })

      const lang    = candidate.preferredLanguage || 'en'
      const thankYou = lang === 'ar'
        ? MSG.thankYouAr(job.title, job.hiringCompany)
        : MSG.thankYouEn(job.title, job.hiringCompany)

      await sendMessage({ agencyId, waNumber, message: thankYou })
      await logMessage(candidate.id, agencyId, 'outbound', 'greeting', thankYou)

      // Send first question
      await sendNextQuestion(candidate, job, agencyId, waNumber, 0)
      break
    }

    case 'screening_q1':
    case 'screening_q2':
    case 'screening_q3':
    case 'screening_q4':
    case 'screening_q5':
    case 'screening_q6': {
      const qIndex = parseInt(state.replace('screening_q', '')) - 1
      const questions = (job.screeningQuestions || []) as any[]

      // Evaluate answer with AI
      let answerScore = 60
      let answerQuality = 'adequate'
      try {
        const evalRes = await axios.post(`${AI_URL}/api/v1/ai/evaluate-answer`, {
          question: questions[qIndex]?.questionTextEn,
          answer: message,
          jobTitle: job.title,
          questionType: questions[qIndex]?.type,
        }, { timeout: 15000 })
        answerScore   = evalRes.data?.data?.score || 60
        answerQuality = evalRes.data?.data?.quality || 'adequate'
      } catch {
        logger.warn('Answer evaluation failed — using default score')
      }

      // Save answer
      await prisma.screeningMessage.update({
        where: {
          id: (await prisma.screeningMessage.findFirst({
            where: { candidateId: candidate.id, direction: 'inbound', questionIndex: qIndex },
            orderBy: { createdAt: 'desc' },
          }))?.id || '',
        },
        data: { answerScore, answerQuality },
      }).catch(() => {})

      // Save salary/notice period if applicable
      const updates: any = {}
      if (questions[qIndex]?.type === 'salary') {
        const salaryMatch = message.match(/\d[\d,]+/)
        if (salaryMatch) updates.salaryExpectation = parseInt(salaryMatch[0].replace(/,/g, ''))
      }
      if (questions[qIndex]?.type === 'availability') {
        if (message.toLowerCase().includes('immediate') || message.includes('فوري')) updates.noticePeriodDays = 0
        else if (message.match(/\d+\s*(day|week|month)/i)) {
          const days = parseInt(message.match(/(\d+)\s*day/i)?.[1] || '0')
          const weeks = parseInt(message.match(/(\d+)\s*week/i)?.[1] || '0') * 7
          const months = parseInt(message.match(/(\d+)\s*month/i)?.[1] || '0') * 30
          updates.noticePeriodDays = days + weeks + months || 30
        }
      }

      const nextQIndex = qIndex + 1
      if (nextQIndex < questions.length) {
        // More questions
        const nextState = `screening_q${nextQIndex + 1}` as any
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { conversationState: nextState, ...updates },
        })
        await sendNextQuestion(candidate, job, agencyId, waNumber, nextQIndex)
      } else {
        // All questions done → request CV
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { conversationState: 'cv_requested', ...updates },
        })
        const lang     = candidate.preferredLanguage || 'en'
        const cvMsg    = lang === 'ar' ? MSG.cvRequestAr() : MSG.cvRequestEn()
        await sendMessage({ agencyId, waNumber, message: cvMsg })
        await logMessage(candidate.id, agencyId, 'outbound', 'cv_request', cvMsg)
      }
      break
    }

    case 'cv_requested': {
      if (msgLower === 'no cv' || msgLower === 'لا يوجد' || msgLower === 'لا' || msgLower === 'no') {
        // WhatsApp profile collection flow
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { conversationState: 'profile_collection', cvType: 'wa_profile' },
        })
        const lang = candidate.preferredLanguage || 'en'
        const profileMsg = lang === 'ar'
          ? 'لا بأس! دعنا نجمع بياناتك.\n\nأولاً: ما هو اسمك الكامل؟'
          : 'No problem! Let me collect your profile.\n\nFirst: What is your full name?'
        await sendMessage({ agencyId, waNumber, message: profileMsg })
      } else if (mediaUrl) {
        // CV file received
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            cvFileUrl: mediaUrl,
            cvType: 'full_cv',
            conversationState: 'cv_received',
            pipelineStage: 'cv_received',
          },
        })

        const lang       = candidate.preferredLanguage || 'en'
        const doneMsg    = lang === 'ar' ? MSG.processingAr() : MSG.processingEn()
        await sendMessage({ agencyId, waNumber, message: doneMsg })
        await logMessage(candidate.id, agencyId, 'outbound', 'status_update', doneMsg)

        // Trigger AI scoring pipeline
        try {
          await axios.post(`${AI_URL}/api/v1/ai/score`, {
            candidateId: candidate.id,
            jobId: job.id,
          }, { timeout: 60000 })
        } catch {
          logger.warn('AI scoring triggered async — will retry')
        }
      } else {
        // Prompt again
        const lang   = candidate.preferredLanguage || 'en'
        const prompt = lang === 'ar'
          ? 'يرجى إرسال سيرتك الذاتية كملف PDF أو Word، أو اكتب *لا يوجد*.'
          : 'Please send your CV as a PDF or Word file, or type *NO CV*.'
        await sendMessage({ agencyId, waNumber, message: prompt })
      }
      break
    }

    case 'slots_requested': {
      // Parse interview slots
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { conversationState: 'scheduled' },
      })

      const lang    = candidate.preferredLanguage || 'en'
      const confirm = lang === 'ar'
        ? 'تم استلام أوقاتك! سيتواصل معك المسؤول عن التوظيف لتأكيد الموعد. 📅'
        : 'Got your availability! The recruiter will confirm your interview time shortly. 📅'
      await sendMessage({ agencyId, waNumber, message: confirm })
      break
    }

    default:
      logger.debug(`No handler for state: ${state}`)
  }
}

// ── SEND NEXT SCREENING QUESTION ──────────────────────────────────────────────
async function sendNextQuestion(candidate: any, job: any, agencyId: string, waNumber: string, qIndex: number) {
  const questions = (job.screeningQuestions || []) as any[]
  if (qIndex >= questions.length) return

  const q    = questions[qIndex]
  const lang = candidate.preferredLanguage || 'en'
  const text = lang === 'ar'
    ? `*سؤال ${qIndex + 1}/${questions.length}:*\n${q.questionTextAr}`
    : `*Question ${qIndex + 1}/${questions.length}:*\n${q.questionTextEn}`

  await sendMessage({ agencyId, waNumber, message: text })
  await logMessage(candidate.id, agencyId, 'outbound', 'screening_q', text, qIndex)
}

// ── LOG MESSAGE ────────────────────────────────────────────────────────────────
async function logMessage(
  candidateId: string,
  agencyId: string,
  direction: 'inbound' | 'outbound',
  type: string,
  content: string,
  questionIndex?: number
) {
  await prisma.screeningMessage.create({
    data: {
      candidateId,
      agencyId,
      direction,
      messageType: type,
      content,
      questionIndex: questionIndex ?? null,
    },
  }).catch(() => {})
}
