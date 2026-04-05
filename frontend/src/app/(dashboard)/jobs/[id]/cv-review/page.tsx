'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { CvReviewCard } from '@/components/candidates/CvReviewCard'
import { toast } from 'react-hot-toast'

interface PageProps { params: { id: string } }

export default function CvReviewPage({ params }: PageProps) {
  const jobId = (params as any).id
  const qc = useQueryClient()

  const { data: jobRes } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<any>(`/jobs/${jobId}`),
  })

  const { data: candidatesRes, isLoading } = useQuery({
    queryKey: ['cv-review', jobId],
    queryFn: () => api.get<any[]>(`/jobs/${jobId}/candidates`, { stage: 'evaluated' }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/candidates/${id}/status`, { pipelineStage: stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cv-review', jobId] }); },
  })

  const job = jobRes?.data?.data
  const candidates = (candidatesRes?.data?.data || []).filter(
    (c: any) => (c.compositeScore || 0) >= 40 && (c.compositeScore || 0) < 75
  )

  const handleConfirm = (id: string) => {
    updateStatus.mutate({ id, stage: 'screening' })
    toast.success('Candidate confirmed — WhatsApp screening will start')
  }
  const handleReject = (id: string) => {
    updateStatus.mutate({ id, stage: 'rejected' })
    toast.success('Candidate rejected')
  }
  const handleShortlist = (id: string) => {
    updateStatus.mutate({ id, stage: 'shortlisted' })
    toast.success('Candidate shortlisted directly')
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>CV Review</h1>
        <p className="text-gray-500 mt-1">
          {job?.title} at {job?.hiringCompany} · Amber zone candidates (score 40–74)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{candidates.length}</div>
          <div className="text-xs text-amber-600 mt-1">Awaiting review</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {candidates.filter((c: any) => (c.dataTags as any)?.returningCandidate?.isReturning).length}
          </div>
          <div className="text-xs text-green-600 mt-1">Returning candidates</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-700">
            {candidates.filter((c: any) => c.authenticityFlag === 'high' || c.authenticityFlag === 'medium').length}
          </div>
          <div className="text-xs text-orange-600 mt-1">Integrity flags</div>
        </div>
      </div>

      {/* Batch actions */}
      {candidates.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => candidates.forEach((c: any) => handleConfirm(c.id))}
            className="text-xs px-4 py-2 rounded-lg font-medium text-white transition-all"
            style={{ background: '#0A3D2E' }}>
            Confirm all ({candidates.length}) → WhatsApp
          </button>
          <button
            onClick={() => candidates.forEach((c: any) => handleReject(c.id))}
            className="text-xs px-4 py-2 rounded-lg font-medium border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all">
            Reject all
          </button>
        </div>
      )}

      {/* Candidate list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-medium">No candidates awaiting review</p>
          <p className="text-sm mt-1">All amber zone candidates have been processed</p>
        </div>
      ) : (
        candidates.map((candidate: any) => (
          <CvReviewCard
            key={candidate.id}
            candidate={candidate}
            jobCurrency={job?.currency}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onShortlist={handleShortlist}
          />
        ))
      )}
    </div>
  )
}
