// src/whatsapp-service/handlers/send.ts
import { Router } from 'express'
import axios from 'axios'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'

export const sendRouter = Router()

// ── SEND MESSAGE (internal API) ───────────────────────────────────────────────
export async function sendMessage(params: {
  agencyId: string
  waNumber: string
  message: string
}) {
  const { agencyId, waNumber, message } = params

  if (process.env.WHATSAPP_MODE === 'mock' || process.env.NODE_ENV === 'development') {
    // Mock mode — log to console, store in DB for mock UI
    logger.info(`[WA MOCK] → ${waNumber}: ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}`)

    // Store for mock UI to display
    const mockStore = (global as any).__mockMessages || {}
    if (!mockStore[waNumber]) mockStore[waNumber] = []
    mockStore[waNumber].push({ direction: 'outbound', text: message, timestamp: new Date() })
    ;(global as any).__mockMessages = mockStore
    return
  }

  // Real 360dialog send
  try {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { waApiKey: true, waNumber: true },
    })

    if (!agency?.waApiKey) {
      logger.error('Agency has no WA API key configured')
      return
    }

    await axios.post(
      'https://waba.360dialog.io/v1/messages',
      {
        to: waNumber,
        type: 'text',
        text: { body: message },
        preview_url: false,
      },
      {
        headers: {
          'D360-API-KEY': agency.waApiKey,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (err: any) {
    logger.error('Failed to send WhatsApp message', { err: err.message })
  }
}

// ── API ENDPOINT for other services ──────────────────────────────────────────
sendRouter.post('/send', async (req, res) => {
  const { agencyId, waNumber, message } = req.body
  if (!agencyId || !waNumber || !message) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Missing required fields' } })
  }
  await sendMessage({ agencyId, waNumber, message })
  res.json({ success: true, data: { sent: true } })
})
