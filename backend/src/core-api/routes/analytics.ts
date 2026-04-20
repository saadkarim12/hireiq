// src/core-api/routes/analytics.ts
import { Router } from 'express'
import { prisma } from '../../shared/db'
import { requireAuth, AuthRequest } from '../middleware/auth'

export const analyticsRouter = Router()
analyticsRouter.use(requireAuth)

// ── DASHBOARD KPIs ────────────────────────────────────────────────────────────
analyticsRouter.get('/dashboard-kpis', async (req: AuthRequest, res) => {
  try {
    const agencyId = req.user!.agencyId

    const [activeJobs, newApplications, shortlistsReady, interviewsToday] = await Promise.all([
      prisma.job.count({ where: { agencyId, status: 'active' } }),
      prisma.candidate.count({ where: { agencyId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.job.count({
        where: {
          agencyId, status: 'active',
          candidates: { some: { pipelineStage: 'shortlisted' } },
        },
      }),
      prisma.interview.count({
        where: {
          agencyId, status: 'confirmed',
          scheduledAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt:  new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
    ])

    res.json({ success: true, data: { activeJobs, newApplications, shortlistsReady, interviewsToday } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get KPIs' } })
  }
})

// ── OVERVIEW ANALYTICS ────────────────────────────────────────────────────────
analyticsRouter.get('/overview', async (req: AuthRequest, res) => {
  try {
    const agencyId = req.user!.agencyId
    const from = new Date(req.query.from as string || new Date(Date.now() - 30 * 86400000))
    const to   = new Date(req.query.to   as string || new Date())

    const [total, screened, shortlisted, interviews, noShows] = await Promise.all([
      prisma.candidate.count({ where: { agencyId, createdAt: { gte: from, lte: to } } }),
      prisma.candidate.count({ where: { agencyId, createdAt: { gte: from, lte: to }, pipelineStage: { in: ['cv_received','evaluated','shortlisted','interviewing','offered','hired'] } } }),
      prisma.candidate.count({ where: { agencyId, shortlistedAt: { gte: from, lte: to } } }),
      prisma.interview.count({ where: { agencyId, scheduledAt: { gte: from, lte: to } } }),
      prisma.interview.count({ where: { agencyId, status: 'no_show', scheduledAt: { gte: from, lte: to } } }),
    ])

    // Avg time to shortlist (hours)
    const shortlistedCandidates = await prisma.candidate.findMany({
      where: { agencyId, shortlistedAt: { not: null }, createdAt: { gte: from, lte: to } },
      select: { createdAt: true, shortlistedAt: true },
    })
    const avgHours = shortlistedCandidates.length
      ? shortlistedCandidates.reduce((sum, c) =>
          sum + (c.shortlistedAt!.getTime() - c.createdAt.getTime()) / 3600000, 0
        ) / shortlistedCandidates.length
      : 0

    // Source channels
    const allCandidates = await prisma.candidate.findMany({
      where: { agencyId, createdAt: { gte: from, lte: to } },
      select: { sourceChannel: true },
    })
    const channelCounts: Record<string, number> = {}
    allCandidates.forEach(c => {
      const ch = c.sourceChannel || 'direct_link'
      channelCounts[ch] = (channelCounts[ch] || 0) + 1
    })
    const topSourceChannels = Object.entries(channelCounts)
      .map(([channel, count]) => ({ channel, count, percentage: (count / (total || 1)) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    res.json({
      success: true,
      data: {
        totalApplications: total,
        totalScreened: screened,
        totalShortlisted: shortlisted,
        avgTimeToShortlistHours: Math.round(avgHours),
        interviewNoShowRate: interviews ? noShows / interviews : 0,
        hireRate: screened ? shortlisted / screened : 0,
        topSourceChannels,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get analytics' } })
  }
})

// ── TIMELINE ──────────────────────────────────────────────────────────────────
analyticsRouter.get('/timeline', async (req: AuthRequest, res) => {
  try {
    const agencyId = req.user!.agencyId
    const from = new Date(req.query.from as string || new Date(Date.now() - 30 * 86400000))
    const to   = new Date(req.query.to   as string || new Date())

    const candidates = await prisma.candidate.findMany({
      where: { agencyId, createdAt: { gte: from, lte: to } },
      select: { createdAt: true, pipelineStage: true, shortlistedAt: true },
    })

    // Group by date
    const byDate: Record<string, { applications: number; screened: number; shortlisted: number }> = {}

    candidates.forEach(c => {
      const date = c.createdAt.toISOString().split('T')[0]
      if (!byDate[date]) byDate[date] = { applications: 0, screened: 0, shortlisted: 0 }
      byDate[date].applications++
      if (['evaluated','shortlisted','interviewing','offered','hired'].includes(c.pipelineStage)) {
        byDate[date].screened++
      }
    })

    candidates.filter(c => c.shortlistedAt).forEach(c => {
      const date = c.shortlistedAt!.toISOString().split('T')[0]
      if (byDate[date]) byDate[date].shortlisted++
    })

    const timeline = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }))

    res.json({ success: true, data: timeline })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get timeline' } })
  }
})

// ── SCORE DISTRIBUTION ────────────────────────────────────────────────────────
analyticsRouter.get('/score-distribution', async (req: AuthRequest, res) => {
  try {
    const candidates = await prisma.candidate.findMany({
      where: { agencyId: req.user!.agencyId, compositeScore: { not: null } },
      select: { compositeScore: true },
    })

    const ranges = ['0-20','21-40','41-60','61-80','81-100']
    const dist = ranges.map(range => {
      const [min, max] = range.split('-').map(Number)
      return { range, count: candidates.filter(c => c.compositeScore! >= min && c.compositeScore! <= max).length }
    })

    res.json({ success: true, data: dist })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get distribution' } })
  }
})

// ── JOBS ANALYTICS ────────────────────────────────────────────────────────────
analyticsRouter.get('/jobs', async (req: AuthRequest, res) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { agencyId: req.user!.agencyId, status: { in: ['active', 'paused'] } },
      include: { _count: { select: { candidates: true } } },
    })

    const result = await Promise.all(jobs.map(async (job) => {
      const [screened, shortlisted, scores] = await Promise.all([
        prisma.candidate.count({ where: { jobId: job.id, pipelineStage: { in: ['evaluated','shortlisted','interviewing','offered','hired'] } } }),
        prisma.candidate.count({ where: { jobId: job.id, pipelineStage: { in: ['shortlisted','interviewing','offered','hired'] } } }),
        prisma.candidate.aggregate({ where: { jobId: job.id, compositeScore: { not: null } }, _avg: { compositeScore: true } }),
      ])

      const total = job._count.candidates
      const daysOpen = job.activatedAt ? Math.floor((Date.now() - job.activatedAt.getTime()) / 86400000) : 0

      return {
        jobId: job.id,
        title: job.title,
        applications: total,
        screenedPercent: total ? (screened / total) * 100 : 0,
        shortlistedPercent: total ? (shortlisted / total) * 100 : 0,
        avgScore: Math.round(scores._avg.compositeScore || 0),
        daysOpen,
        pipelineVelocity: daysOpen ? total / daysOpen : 0,
        status: job.status,
      }
    }))

    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get jobs analytics' } })
  }
})

// ── EXPORT CSV (placeholder) ──────────────────────────────────────────────────
analyticsRouter.get('/export', async (req: AuthRequest, res) => {
  res.json({ success: true, data: { downloadUrl: `http://localhost:3001/exports/analytics-${Date.now()}.csv` } })
})

// ── ANALYTICS V1 — aggregate payload for the /analytics page ─────────────────
// GET /api/v1/analytics?period=30&jobId=<optional>
// Active Jobs is always agency-wide (never period- or job-filtered). Everything
// else respects period + optional jobId.
analyticsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const agencyId = req.user!.agencyId
    const period = Math.max(1, parseInt((req.query.period as string) || '30'))
    const jobId = (req.query.jobId as string) || null
    const fromDate = new Date(Date.now() - period * 86400000)

    const candidateWhere: any = { agencyId, createdAt: { gte: fromDate } }
    if (jobId) candidateWhere.jobId = jobId

    const [candidates, activeJobs] = await Promise.all([
      prisma.candidate.findMany({
        where: candidateWhere,
        select: {
          id: true, pipelineStage: true, createdAt: true, hiredAt: true,
          shortlistedAt: true, sourceChannel: true, compositeScore: true,
          jobId: true, pipelineStageHistory: true,
        },
      }),
      prisma.job.count({ where: { agencyId, status: 'active' } }),
    ])

    // ── Funnel (5 stages) ──────────────────────────────────────────────────
    const stageMatches: Record<string, string[]> = {
      applied: ['applied', 'evaluated', 'screening'],
      l1:      ['shortlisted', 'interviewing', 'offered', 'hired'],
      l2:      ['interviewing', 'offered', 'hired'],
      l3:      ['offered', 'hired'],
      final:   ['hired'],
    }
    const stageOrder = ['applied', 'l1', 'l2', 'l3', 'final'] as const
    const funnel = stageOrder.map((stage, i) => {
      const count = candidates.filter(c => stageMatches[stage].includes(c.pipelineStage)).length
      const prev = i > 0 ? candidates.filter(c => stageMatches[stageOrder[i-1]].includes(c.pipelineStage)).length : count
      const dropToNext = i > 0 && prev > 0 ? Math.round(((prev - count) / prev) * 100) : 0
      return { stage, count, dropToNext }
    })

    // ── KPIs ───────────────────────────────────────────────────────────────
    const hired = candidates.filter(c => c.pipelineStage === 'hired')
    const hireRate = candidates.length > 0
      ? Math.round((hired.length / candidates.length) * 100)
      : 0

    // Avg time to fill: for hired candidates in period, days from candidate.createdAt to hiredAt
    // (job.createdAt would require another query + candidates may pre-date a job edit; candidate.createdAt
    // captures "when did this application start")
    const timeToFillDays = hired
      .filter(c => c.hiredAt && c.createdAt)
      .map(c => (new Date(c.hiredAt!).getTime() - new Date(c.createdAt).getTime()) / 86400000)
    const avgTimeToFillDays = timeToFillDays.length > 0
      ? Math.round(timeToFillDays.reduce((a, b) => a + b, 0) / timeToFillDays.length)
      : null

    // ── Avg time at each stage ─────────────────────────────────────────────
    // Uses pipelineStageHistory (array of {from, to, timestamp, userId}) added in v1.7.0.
    // For each candidate, sort history and for each entry compute (next.timestamp − this.timestamp)
    // attributed to `this.to` stage. The first entry's `from` stage time = (first.timestamp − createdAt).
    const stageDurations: Record<string, number[]> = {
      applied: [], l1: [], l2: [], l3: [], final: [],
    }
    const stageToFunnelKey = (s: string): string | null => {
      if (['applied','evaluated','screening'].includes(s)) return 'applied'
      if (s === 'shortlisted') return 'l1'
      if (s === 'interviewing') return 'l2'
      if (s === 'offered') return 'l3'
      if (s === 'hired') return 'final'
      return null
    }
    for (const c of candidates) {
      const history = Array.isArray(c.pipelineStageHistory) ? c.pipelineStageHistory as any[] : []
      if (history.length === 0) continue
      const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      // First entry: time in the `from` stage = first.timestamp − createdAt
      const firstFromKey = stageToFunnelKey(sorted[0].from)
      if (firstFromKey) {
        const days = (new Date(sorted[0].timestamp).getTime() - new Date(c.createdAt).getTime()) / 86400000
        if (days >= 0) stageDurations[firstFromKey].push(days)
      }
      // Remaining: time in `to` of entry N = entry N+1 timestamp − entry N timestamp
      for (let i = 0; i < sorted.length - 1; i++) {
        const toKey = stageToFunnelKey(sorted[i].to)
        if (!toKey) continue
        const days = (new Date(sorted[i+1].timestamp).getTime() - new Date(sorted[i].timestamp).getTime()) / 86400000
        if (days >= 0) stageDurations[toKey].push(days)
      }
      // Last entry's `to` stage is still in progress — skip (incomplete dwell time)
    }
    const avgTimeAtStage = stageOrder.map(stage => {
      const xs = stageDurations[stage]
      const avgDays = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
      return { stage, avgDays: avgDays != null ? Math.round(avgDays * 10) / 10 : null, sample: xs.length }
    })

    // ── Source performance ─────────────────────────────────────────────────
    const bySource: Record<string, { candidates: any[]; hires: number; scoreSum: number; scoreN: number }> = {}
    for (const c of candidates) {
      const src = c.sourceChannel || 'unknown'
      if (!bySource[src]) bySource[src] = { candidates: [], hires: 0, scoreSum: 0, scoreN: 0 }
      bySource[src].candidates.push(c)
      if (c.pipelineStage === 'hired') bySource[src].hires++
      if (c.compositeScore != null) {
        bySource[src].scoreSum += c.compositeScore
        bySource[src].scoreN++
      }
    }
    const sourcePerformance = Object.entries(bySource)
      .map(([source, d]) => ({
        source,
        candidates: d.candidates.length,
        hires: d.hires,
        conversionRate: d.candidates.length > 0 ? Math.round((d.hires / d.candidates.length) * 100) : 0,
        avgComposite: d.scoreN > 0 ? Math.round(d.scoreSum / d.scoreN) : null,
      }))
      .sort((a, b) => b.candidates - a.candidates)

    // Total stage transitions across all candidates — used by the frontend to
    // decide whether to render the Time at Stage chart at all.
    const totalTransitions = candidates.reduce(
      (n, c) => n + (Array.isArray(c.pipelineStageHistory) ? (c.pipelineStageHistory as any[]).length : 0),
      0,
    )

    res.json({
      success: true,
      data: {
        period,
        jobId,
        kpis: {
          activeJobs,                                  // agency-wide, never filtered
          avgTimeToFillDays,
          hireRate,
          costPerHire: null,                           // Phase 7
        },
        funnel,
        avgTimeAtStage,
        sourcePerformance,
        recruiterPerformance: [],                      // Phase 7 — requires per-action user tracking
        meta: {
          totalCandidates: candidates.length,
          totalTransitions,
        },
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed' } })
  }
})
