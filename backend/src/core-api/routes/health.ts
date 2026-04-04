// src/core-api/routes/health.ts
import { Router } from 'express'
import { prisma } from '../../shared/db'

export const healthRouter = Router()

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', service: 'core-api', database: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', service: 'core-api', database: 'disconnected' })
  }
})
