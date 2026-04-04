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
