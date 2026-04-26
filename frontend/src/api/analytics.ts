// src/api/analytics.ts
import { api } from './client'
import type { AnalyticsOverview, JobAnalytics, DashboardKPIs } from '@/types'

// Analytics v1 aggregate payload (the /analytics page)
export interface AnalyticsPayload {
  period: number
  jobId: string | null
  kpis: {
    activeJobs: number
    avgTimeToFillDays: number | null
    hireRate: number
    costPerHire: number | null
    tpDirectL1Count?: number
    tpDirectL1Percent?: number
    tpDirectL1Total?: number
  }
  funnel: Array<{ stage: 'applied' | 'l1' | 'l2' | 'l3' | 'final'; count: number; dropToNext: number }>
  avgTimeAtStage: Array<{ stage: 'applied' | 'l1' | 'l2' | 'l3' | 'final'; avgDays: number | null; sample: number }>
  sourcePerformance: Array<{
    source: string
    candidates: number
    hires: number
    conversionRate: number
    avgComposite: number | null
  }>
  recruiterPerformance: Array<{ recruiter: string; decisions: number }>
  meta: { totalCandidates: number; totalTransitions: number }
}

export const analyticsApi = {
  // Analytics v1 — aggregate page payload
  get: async (period: number, jobId?: string): Promise<AnalyticsPayload> => {
    const qs = new URLSearchParams({ period: String(period) })
    if (jobId) qs.set('jobId', jobId)
    const res = await api.get<AnalyticsPayload>(`/analytics?${qs.toString()}`)
    return res.data.data
  },

  // Dashboard KPIs
  getDashboardKpis: async (): Promise<DashboardKPIs> => {
    const res = await api.get<DashboardKPIs>('/analytics/dashboard-kpis')
    return res.data.data
  },

  // Overview analytics
  getOverview: async (params: { from: string; to: string }): Promise<AnalyticsOverview> => {
    const res = await api.get<AnalyticsOverview>('/analytics/overview', params)
    return res.data.data
  },

  // Per-job analytics
  getJobsAnalytics: async (params?: { status?: string }): Promise<JobAnalytics[]> => {
    const res = await api.get<JobAnalytics[]>('/analytics/jobs', params)
    return res.data.data
  },

  // Applications over time
  getApplicationsTimeline: async (params: { from: string; to: string; jobId?: string }) => {
    const res = await api.get<Array<{ date: string; applications: number; screened: number; shortlisted: number }>>('/analytics/timeline', params)
    return res.data.data
  },

  // Score distribution
  getScoreDistribution: async (params?: { jobId?: string }) => {
    const res = await api.get<Array<{ range: string; count: number }>>('/analytics/score-distribution', params)
    return res.data.data
  },

  // Export CSV
  exportCsv: async (params: { from: string; to: string }): Promise<string> => {
    const res = await api.get<{ downloadUrl: string }>('/analytics/export', { ...params, format: 'csv' })
    return res.data.data.downloadUrl
  },
}
