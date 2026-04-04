// src/api/candidates.ts
import { api } from './client'
import type { CandidateFull, CandidateSummary, PipelineStage, RejectionReason } from '@/types'

export const candidatesApi = {
  // Search talent pool
  search: async (params?: {
    roleCategory?: string
    seniority?: string
    availability?: string
    q?: string
    cursor?: string
    limit?: number
  }) => {
    const res = await api.get<CandidateSummary[]>('/candidates', params)
    return res.data
  },

  // Get full candidate profile
  get: async (id: string): Promise<CandidateFull> => {
    const res = await api.get<CandidateFull>(`/candidates/${id}`)
    return res.data.data
  },

  // Update pipeline stage
  updateStatus: async (id: string, update: {
    pipelineStage: PipelineStage
    rejectionReason?: RejectionReason
    note?: string
  }) => {
    const res = await api.patch<CandidateFull>(`/candidates/${id}/status`, update)
    return res.data.data
  },

  // Save to talent pool (prevents 30-day deletion)
  saveToPool: async (id: string) => {
    const res = await api.post<{ id: string; pipelineStage: PipelineStage }>(`/candidates/${id}/save-to-pool`)
    return res.data.data
  },

  // Get WhatsApp transcript
  getTranscript: async (id: string) => {
    const res = await api.get<{ messages: CandidateFull['screeningTranscript'] }>(`/candidates/${id}/transcript`)
    return res.data.data.messages
  },
}
