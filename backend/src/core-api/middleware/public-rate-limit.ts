import rateLimit from 'express-rate-limit'

// Per-IP limiters for the public /apply endpoint. Mounted ON the public
// router only — the global /api/v1/ limiter (200/min) does NOT apply
// because the public router is mounted before it in index.ts.

const tooMany = (msg: string) => ({
  success: false,
  error: { code: 'RATE_LIMIT', message: msg },
})

export const publicGetLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many requests. Please slow down.'),
})

export const publicSubmitHourLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('You have submitted too many applications recently. Please try again later.'),
})

export const publicSubmitDayLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Daily application limit reached from this network.'),
})
