import { Request, Response, NextFunction } from 'express'

// Hidden form field that real users never see (positioned off-screen,
// tabIndex=-1, autoComplete=off in the React form). Bots that auto-fill
// every input will populate it. We respond 200 generically so the bot
// thinks the submission succeeded — they don't retry, no DB row created.
const HONEYPOT_FIELD = 'hp_website'

export function honeypotGuard(req: Request, res: Response, next: NextFunction) {
  const value = req.body?.[HONEYPOT_FIELD]
  if (typeof value === 'string' && value.trim().length > 0) {
    return res.status(200).json({ success: true, message: 'Application received' })
  }
  next()
}
