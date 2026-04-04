// src/api/analytics.ts
import { api } from './client'
import type { AnalyticsOverview, JobAnalytics, DashboardKPIs } from '@/types'

export const analyticsApi = {
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
