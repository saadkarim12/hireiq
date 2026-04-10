// src/core-api/index.ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { Server } from 'socket.io'
import { createServer } from 'http'
import { logger } from '../shared/logger'

// Routes
import { authRouter }       from './routes/auth'
import { jobsRouter }       from './routes/jobs'
import { bulkUploadRouter }    from './routes/bulk-upload'
import { candidatesRouter } from './routes/candidates'
import { analyticsRouter }  from './routes/analytics'
import { adminRouter }      from './routes/admin'
import { healthRouter }     from './routes/health'

const app  = express()
const http = createServer(app)
const PORT = process.env.CORE_API_PORT || 3001

// ── Socket.io for real-time updates ──────────────────────────────────────────
export const io = new Server(http, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
})

io.on('connection', (socket) => {
  const agencyId = socket.handshake.query.agencyId as string
  if (agencyId) {
    socket.join(`agency:${agencyId}`)
    logger.debug(`Socket connected: ${socket.id} → agency:${agencyId}`)
  }
  socket.on('disconnect', () => logger.debug(`Socket disconnected: ${socket.id}`))
})

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'))

// Rate limiting
app.use('/api/v1/', rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
}))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health',        healthRouter)
app.use('/api/v1/auth',       authRouter)
app.use('/api/v1/jobs',       jobsRouter)
app.use('/api/v1/candidates', candidatesRouter)
app.use('/api/v1/analytics',  analyticsRouter)
app.use('/api/v1',            bulkUploadRouter)
app.use('/api/v1/admin',      adminRouter)

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack })
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
})

// ── Start ─────────────────────────────────────────────────────────────────────
http.listen(PORT, () => {
  logger.info(`🚀 Core API running on http://localhost:${PORT}`)
})

export default app
