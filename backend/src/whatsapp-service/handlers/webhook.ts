// src/whatsapp-service/handlers/webhook.ts
import { Router } from 'express'
import crypto from 'crypto'
import { prisma } from '../../shared/db'
import { handleIncomingMessage } from './conversation'
import { logger } from '../../shared/logger'

export const webhookRouter = Router()

// ── 360dialog webhook ─────────────────────────────────────────────────────────
webhookRouter.post('/whatsapp', async (req, res) => {
  // Validate HMAC signature
  const signature = req.headers['x-360dialog-signature'] as string
  const secret    = process.env.DIALOG360_WEBHOOK_SECRET || 'mock-secret'

  if (process.env.WHATSAPP_MODE !== 'mock' && signature) {
    const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex')
    if (signature !== expected) {
      logger.warn('Invalid webhook signature')
      return res.status(403).json({ error: 'Invalid signature' })
    }
  }

  // Always return 200 immediately (WhatsApp API requirement)
  res.status(200).json({ status: 'ok' })

  // Process async
  try {
    const { messages, contacts } = req.body

    if (!messages?.length) return

    for (const msg of messages) {
      const waNumber  = msg.from
      const messageId = msg.id
      const text      = msg.text?.body || ''
      const mediaUrl  = msg.image?.link || msg.document?.link || null

      // Extract shortcode from initial message (e.g., "APPLY JB001")
      const shortcodeMatch = text.match(/\b(JB[A-Z0-9]+)\b/i)
      const jobShortcode   = shortcodeMatch?.[1]?.toUpperCase()

      // Find agency from the WhatsApp number that received the message
      const phoneNumberId = req.body.metadata?.phone_number_id
      const agency = await prisma.agency.findFirst({
        where: phoneNumberId ? {} : { isActive: true },
        select: { id: true, name: true },
      })

      if (!agency) {
        logger.warn('No agency found for webhook')
        continue
      }

      await handleIncomingMessage({
        waNumber,
        message: text,
        mediaUrl,
        agencyId: agency.id,
        agencyName: agency.name,
        jobShortcode,
      })
    }
  } catch (err) {
    logger.error('Webhook processing error', { err })
  }
})
