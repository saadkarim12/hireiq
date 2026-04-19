// src/whatsapp-service/index.ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { logger } from '../shared/logger'
import { webhookRouter } from './handlers/webhook'
import { sendRouter }    from './handlers/send'
import { mockRouter }    from './mock/mock-router'
import { simulateScreeningRouter } from './mock/simulate-screening'

const app  = express()
const PORT = process.env.WHATSAPP_PORT || 3003

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'whatsapp', mode: process.env.WHATSAPP_MODE || 'mock' }))

// Real webhook from 360dialog
app.use('/webhook', webhookRouter)

// Internal send API (called by other services)
app.use('/api/v1/wa', sendRouter)

// Mock UI for testing without real WhatsApp
if (process.env.WHATSAPP_MODE === 'mock' || process.env.NODE_ENV === 'development') {
  app.use('/mock', mockRouter)
  app.use('/mock', simulateScreeningRouter)
  logger.info('📱 WhatsApp MOCK mode active — test at http://localhost:3003/mock')
}

app.listen(PORT, () => logger.info(`💬 WhatsApp Service running on http://localhost:${PORT}`))

export default app
