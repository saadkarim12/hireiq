// src/core-api/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../../shared/db'

export interface AuthRequest extends Request {
  user?: { id: string; agencyId: string; role: string; email: string }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } })
    }

    const token = header.split(' ')[1]
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as {
      userId: string; agencyId: string; role: string; email: string
    }

    req.user = { id: payload.userId, agencyId: payload.agencyId, role: payload.role, email: payload.email }
    next()
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } })
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
    }
    next()
  }
}

// Development bypass — generates a token for testing without Azure AD B2C
export async function generateDevToken(agencyId: string, userId: string, role = 'agency_admin') {
  return jwt.sign(
    { userId, agencyId, role, email: 'dev@hireiq.ai' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '365d' }
  )
}
