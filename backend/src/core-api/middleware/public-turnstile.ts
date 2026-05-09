import { Request, Response, NextFunction } from 'express'
import axios from 'axios'
import { logger } from '../../shared/logger'

// Cloudflare Turnstile verification, env-gated. No-op when TURNSTILE_SECRET_KEY
// is unset (dev / pre-provisioning). Activates the moment the key is set in
// env — no code change needed. Companion site key on frontend:
// NEXT_PUBLIC_TURNSTILE_SITE_KEY.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function turnstileGuard(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return next()  // not configured → pass through

  const token = req.body?.cf_turnstile_response
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'CAPTCHA_REQUIRED', message: 'Please complete the verification.' },
    })
  }

  try {
    const params = new URLSearchParams({ secret, response: token, remoteip: req.ip || '' })
    const verify = await axios.post(VERIFY_URL, params, { timeout: 5000 })
    if (!verify.data?.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CAPTCHA_FAILED', message: 'Verification failed. Please try again.' },
      })
    }
    next()
  } catch (err: any) {
    logger.warn('Turnstile verify error', { err: err.message })
    return res.status(503).json({
      success: false,
      error: { code: 'CAPTCHA_UNAVAILABLE', message: 'Verification service unavailable. Please retry shortly.' },
    })
  }
}
