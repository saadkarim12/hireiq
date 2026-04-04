// src/core-api/routes/auth.ts
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest, generateDevToken } from '../middleware/auth'
import { logger } from '../../shared/logger'

export const authRouter = Router()

// ── DEV ONLY: Login without Azure AD B2C ──────────────────────────────────────
authRouter.post('/dev-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
  }

  try {
    const { email } = req.body
    const user = await prisma.user.findFirst({ where: { email }, include: { agency: true } })

    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'User not found' } })
    }

    const token = await generateDevToken(user.agencyId, user.id, user.role)

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    logger.info(`Dev login: ${user.email} (${user.role})`)

    res.json({
      success: true,
      data: {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          agencyId: user.agencyId,
          agencyName: user.agency.name,
        },
      },
    })
  } catch (err) {
    logger.error('Dev login error', { err })
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } })
  }
})

// ── Get current user profile ──────────────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { agency: { select: { name: true, logoUrl: true, subscriptionTier: true, waNumber: true } } },
    })

    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })

    res.json({ success: true, data: { ...user, agency: user.agency } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get user' } })
  }
})

// ── Invite user ───────────────────────────────────────────────────────────────
authRouter.post('/invite', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { email, fullName, role } = req.body
    const inviteToken = require('crypto').randomBytes(32).toString('hex')

    const user = await prisma.user.create({
      data: {
        agencyId: req.user!.agencyId,
        email,
        fullName,
        role,
        status: 'invited',
        inviteToken,
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    // TODO: send invite email via Azure Communication Services
    logger.info(`Invite sent to ${email}`)

    res.status(201).json({ success: true, data: { userId: user.id, inviteSent: true } })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Email already exists' } })
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Invite failed' } })
  }
})
