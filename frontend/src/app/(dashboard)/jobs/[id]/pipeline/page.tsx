'use client'
// src/app/(dashboard)/jobs/[id]/pipeline/page.tsx
import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '@/api/jobs'
import { candidatesApi } from '@/api/candidates'
import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { CandidatePanel } from '@/components/candidates/CandidatePanel'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { SparklesIcon, ArrowDownTrayIcon, ShareIcon } from '@heroicons/react/24/outline'
import type { CandidateSummary, PipelineStage } from '@/types'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface PageProps { params: { id: string } }

const STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'applied', stages: ['applied','evaluated','screening'], label: 'Applied', color: 'border-slate-300' },
  { key: 'shortlisted',  label: 'L1 — CV Screened',   color: 'border-amber-400' },
  { key: 'interviewing', label: 'L2 — WA Screened',   color: 'border-blue-400' },
  { key: 'offered',      label: 'L3 — Interviewed',   color: 'border-purple-400' },
  { key: 'hired', label: 'Final Shortlist', color: 'border-green-500' },
]

export default function PipelinePage({ params }: PageProps) {
  const id = (params as any).id
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id),
  })

  const { data: pipelineCounts } = useQuery({
    queryKey: ['pipeline-counts', id],
    queryFn: () => jobsApi.getPipeline(id),
    refetchInterval: 30_000,
  })

  const { data: candidatesData } = useQuery({
    queryKey: ['job-candidates', id],
    queryFn: () => jobsApi.getCandidates(id, { limit: 200 }),
    // Poll faster while any candidate is in mid-screening (L1 sim usually ~15-30s);
    // back off to 30s idle to keep network chatter sane.
    refetchInterval: (q) => {
      const data: any = q.state.data
      const list = data?.data || []
      const inFlight = list.some((c: any) => c.pipelineStage === 'shortlisted' && typeof c.conversationState === 'string' && c.conversationState.startsWith('screening_q'))
      return inFlight ? 3_000 : 30_000
    },
  })

  const candidates: CandidateSummary[] = candidatesData?.data || []

  const updateStatusMutation = useMutation({
    mutationFn: ({ candidateId, stage }: { candidateId: string; stage: PipelineStage }) =>
      candidatesApi.updateStatus(candidateId, { pipelineStage: stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-candidates', id] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-counts', id] })
    },
    onError: () => toast.error('Failed to update candidate status'),
  })

  const handleStageChange = (candidateId: string, newStage: PipelineStage) => {
    updateStatusMutation.mutate({ candidateId, stage: newStage })
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
      const url = await jobsApi.exportPdf(id)
      window.open(url, '_blank')
      toast.success('Shortlist PDF ready for download')
    } catch {
      toast.error('Failed to generate PDF')
    } finally {
      setIsExporting(false)
    }
  }

  const handleShare = async () => {
    if (!job) return
    const applyUrl = `https://hireiq.ai/apply/${job.applyUrlSlug}`
    await navigator.clipboard.writeText(applyUrl)
    toast.success('Apply link copied to clipboard!')
  }

  const handleLinkedIn = () => {
    if (!job) return
    const applyUrl = `https://hireiq.ai/apply/${job.applyUrlSlug}`
    const country = job.locationCountry === 'AE' ? 'UAE' : job.locationCountry === 'SA' ? 'Saudi Arabia' : job.locationCountry
    const post = `🚀 We're Hiring: ${job.title}
📍 ${job.hiringCompany} · ${job.locationCity}, ${country}
💼 ${job.jobType.charAt(0).toUpperCase() + job.jobType.slice(1)} | ${job.currency} ${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()}/month
⏳ Min. ${job.minExperienceYears}+ years experience

${job.requiredSkills.length > 0 ? `🎯 Must-have skills:
${job.requiredSkills.map(s => `• ${s}`).join('\n')}` : ''}
${job.preferredSkills?.length > 0 ? `
⭐ Nice to have: ${job.preferredSkills.slice(0,3).join(', ')}` : ''}

📋 About the role:
${job.jdText?.slice(0, 400)}${job.jdText?.length > 400 ? '...' : ''}

✅ How to apply:
No lengthy forms. Click the link below to apply via WhatsApp — our AI will guide you through a quick 5-minute screening conversation.

👉 Apply now: ${applyUrl}

${job.locationCountry === 'AE' ? '#UAEJobs #DubaiJobs #AbuDhabiJobs' : '#SaudiJobs #RiyadhJobs #KSAJobs'} #${job.title.replace(/\s+/g,'').replace(/[^a-zA-Z]/g,'')} #Hiring #${job.hiringCompany.replace(/\s+/g,'')} #Recruitment #HireIQ`

    navigator.clipboard.writeText(post)
    toast.success('LinkedIn post copied to clipboard! Paste it on LinkedIn.')
  }

  const shortlistedCount = pipelineCounts?.shortlisted || 0
  const hasUnreviewedShortlist = shortlistedCount > 0

  if (jobLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-64 rounded" />
        <div className="skeleton h-4 w-48 rounded" />
        <div className="flex gap-4 mt-6">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton flex-1 h-64 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Sub-header */}
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-brand-navy truncate">{job?.title}</h1>
                {job && <JobStatusBadge status={job.status} />}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{job?.hiringCompany} · {job?.locationCity}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleShare}
              className="btn-secondary text-xs gap-1.5"
            >
              <ShareIcon className="w-3.5 h-3.5" />
              Share Link
            </button>
            <button
              onClick={() => router.push(`/jobs/${id}/talent-matches`)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all"
              style={{ borderColor: '#0A3D2E', color: '#0A3D2E' }}>
              👥 Talent Pool Matches
            </button>
            <button
              onClick={handleLinkedIn}
              className="btn-secondary text-xs gap-1.5"
              style={{color:'#0077B5', borderColor:'#0077B5'}}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              Post on LinkedIn
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isExporting || shortlistedCount === 0}
              className="btn-secondary text-xs gap-1.5"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              {isExporting ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* Shortlist ready banner */}
        {hasUnreviewedShortlist && (
          <div className="mx-6 mt-4 bg-brand-gold/10 border border-brand-gold/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <SparklesIcon className="w-4 h-4 text-brand-gold flex-shrink-0" />
              <p className="text-sm font-semibold text-brand-navy">
                AI shortlisted <span className="text-brand-gold">{shortlistedCount} candidates</span> — ready for your review
              </p>
            </div>
            <button
              onClick={() => {
                // Scroll to shortlisted column
                document.getElementById('column-shortlisted')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
              }}
              className="text-xs font-semibold text-brand-gold hover:underline"
            >
              View Shortlist →
            </button>
          </div>
        )}


        {/* Pipeline Funnel Summary */}
        <div className="mb-4 bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Pipeline Overview</h2>
              <p className="text-xs text-gray-400 mt-0.5">Conversion funnel for this job</p>
            </div>
            {(() => {
              const applied = candidates.filter(c => ['applied','evaluated','screening','shortlisted','interviewing','offered','hired'].includes(c.pipelineStage)).length
              const finalCount = candidates.filter(c => c.pipelineStage === 'hired').length
              const rate = applied > 0 ? Math.round((finalCount / applied) * 100) : 0
              return (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Conversion:</span>
                  <span className="text-sm font-bold px-2.5 py-1 rounded-full" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>{rate}%</span>
                </div>
              )
            })()}
          </div>

          {(() => {
              const stages = [
                { key: 'applied', label: 'Applied', match: ['applied','evaluated','screening'], color: '#64748B', bg: '#F1F5F9' },
                { key: 'l1', label: 'L1 CV Screened', match: ['shortlisted','interviewing','offered','hired'], color: '#C9A84C', bg: '#FEF3C7' },
                { key: 'l2', label: 'L2 WA Screened', match: ['interviewing','offered','hired'], color: '#1D4ED8', bg: '#DBEAFE' },
                { key: 'l3', label: 'L3 Interviewed', match: ['offered','hired'], color: '#7C3AED', bg: '#EDE9FE' },
                { key: 'final', label: 'Final Shortlist', match: ['hired'], color: '#166534', bg: '#DCFCE7' },
              ]

              return (
                <div className="grid grid-cols-5 gap-2">
                  {stages.map((s, i) => {
                    const count = candidates.filter(c => s.match.includes(c.pipelineStage)).length
                    const prev = i > 0 ? candidates.filter(c => stages[i-1].match.includes(c.pipelineStage)).length : count
                    const dropRate = prev > 0 ? Math.round((count / prev) * 100) : 0

                    return (
                      <div key={s.key} className="flex flex-col items-center">
                        <div className="h-5 flex items-center justify-center">
                          {i > 0 && (
                            <span className="text-[10px] font-medium text-gray-400">
                              → {dropRate}%
                            </span>
                          )}
                        </div>
                        <div className="w-full rounded-xl flex items-center justify-center py-4 border-2"
                          style={{ background: s.bg, borderColor: count > 0 ? s.color + '40' : 'transparent' }}>
                          <span className="text-3xl font-bold" style={{ color: s.color }}>{count}</span>
                        </div>
                        <p className="text-xs font-medium text-center mt-2" style={{ color: s.color }}>{s.label}</p>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            stages={STAGES}
            candidates={candidates}
            pipelineCounts={pipelineCounts}
            onCandidateClick={(candidateId) => setSelectedCandidateId(candidateId)}
            onStageChange={handleStageChange}
          />
        </div>
      </div>

      {/* Candidate Profile Panel */}
      {selectedCandidateId && (
        <CandidatePanel
          candidateId={selectedCandidateId}
          onClose={() => setSelectedCandidateId(null)}
          onStatusUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['job-candidates', id] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-counts', id] })
          }}
        />
      )}
    </>
  )
}
