// src/api/jobs.ts
import { api } from './client'
import type { Job, CreateJobForm, PipelineCounts, CandidateSummary, JobAnalytics } from '@/types'

export const jobsApi = {
  // List all jobs for the agency
  list: async (params?: { status?: string; cursor?: string; limit?: number }) => {
    const res = await api.get<Job[]>('/jobs', params)
    return res.data
  },

  // Get single job
  get: async (id: string) => {
    const res = await api.get<Job>(`/jobs/${id}`)
    return res.data.data
  },

  // Create new job (DRAFT)
  create: async (form: CreateJobForm) => {
    const res = await api.post<Job>('/jobs', form)
    return res.data.data
  },

  // Update job
  update: async (id: string, updates: Partial<CreateJobForm>) => {
    const res = await api.patch<Job>(`/jobs/${id}`, updates)
    return res.data.data
  },

  // Activate job
  activate: async (id: string) => {
    const res = await api.post<Job>(`/jobs/${id}/activate`)
    return res.data.data
  },

  // Update job status (currently only supports active → archived; activate
  // uses the dedicated POST /:id/activate endpoint).
  updateStatus: async (id: string, status: 'archived') => {
    const res = await api.patch<Job>(`/jobs/${id}/status`, { status })
    return res.data.data
  },

  // Restore an archived job to active.
  unarchive: async (id: string) => {
    const res = await api.post<Job>(`/jobs/${id}/unarchive`)
    return res.data.data
  },

  // Hard-delete a draft. Backend rejects 409 for non-drafts.
  remove: async (id: string) => {
    const res = await api.delete<{ id: string; deleted: boolean }>(`/jobs/${id}`)
    return res.data.data
  },

  // Duplicate job
  duplicate: async (id: string) => {
    const res = await api.post<Job>(`/jobs/${id}/duplicate`)
    return res.data.data
  },

  // Get pipeline counts
  getPipeline: async (id: string) => {
    const res = await api.get<PipelineCounts>(`/jobs/${id}/pipeline`)
    return res.data.data
  },

  // Get shortlist
  getShortlist: async (id: string, limit = 20) => {
    const res = await api.get<CandidateSummary[]>(`/jobs/${id}/shortlist`, { limit })
    return res.data.data
  },

  // Get all candidates for a job (paginated)
  getCandidates: async (id: string, params?: {
    stage?: string
    cursor?: string
    limit?: number
    orderBy?: string
  }) => {
    const res = await api.get<CandidateSummary[]>(`/jobs/${id}/candidates`, params)
    return res.data
  },

  // Export PDF shortlist
  exportPdf: async (id: string): Promise<string> => {
    const res = await api.post<{ downloadUrl: string; expiresAt: string }>(`/jobs/${id}/export/pdf`)
    return res.data.data.downloadUrl
  },

  // Get per-job analytics
  getAnalytics: async (id: string): Promise<JobAnalytics> => {
    const res = await api.get<JobAnalytics>(`/analytics/jobs/${id}`)
    return res.data.data
  },
}
