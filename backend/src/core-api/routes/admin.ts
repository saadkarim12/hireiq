// src/core-api/routes/admin.ts
import { Router } from 'express'
import { prisma } from '../../shared/db'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('hireiq_admin'))

adminRouter.get('/agencies', async (_req, res) => {
  try {
    const agencies = await prisma.agency.findMany({
      include: { _count: { select: { users: true, jobs: true, candidates: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: agencies })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list agencies' } })
  }
})

adminRouter.post('/agencies', async (req, res) => {
  try {
    const { name, slug, subscriptionTier, adminEmail, adminName } = req.body
    const agency = await prisma.agency.create({
      data: { name, slug, subscriptionTier: subscriptionTier || 'pilot' },
    })
    const user = await prisma.user.create({
      data: { agencyId: agency.id, email: adminEmail, fullName: adminName, role: 'agency_admin', status: 'invited' },
    })
    res.status(201).json({ success: true, data: { agencyId: agency.id, adminUserId: user.id } })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Slug already taken' } })
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create agency' } })
  }
})
