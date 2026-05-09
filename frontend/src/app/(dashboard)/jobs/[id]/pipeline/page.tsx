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
import { SparklesIcon, ArrowDownTrayIcon, ShareIcon, MagnifyingGlassIcon, ArrowUturnLeftIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
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
  const [tab, setTab] = useState<'accepted' | 'rejected'>('accepted')
  const [searchQuery, setSearchQuery] = useState('')

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

  const matchesSearch = (c: CandidateSummary) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      (c.fullName?.toLowerCase().includes(q) ?? false) ||
      (c.currentRole?.toLowerCase().includes(q) ?? false) ||
      (((c as any).email as string | null)?.toLowerCase().includes(q) ?? false)
    )
  }

  const acceptedCandidates = candidates.filter(c => c.pipelineStage !== 'rejected')
  const rejectedCandidates = candidates.filter(c => c.pipelineStage === 'rejected')
  const visibleAccepted = acceptedCandidates.filter(matchesSearch)
  const visibleRejected = rejectedCandidates.filter(matchesSearch)

  const updateStatusMutation = useMutation({
    mutationFn: ({ candidateId, stage }: { candidateId: string; stage: PipelineStage }) =>
      candidatesApi.updateStatus(candidateId, { pipelineStage: stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-candidates', id] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-counts', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Failed to update candidate status'),
  })

  const handleStageChange = (candidateId: string, newStage: PipelineStage) => {
    updateStatusMutation.mutate({ candidateId, stage: newStage })
  }

  const handleRestoreFromRejected = (candidateId: string, name: string | null) => {
    updateStatusMutation.mutate(
      { candidateId, stage: 'applied' as PipelineStage },
      { onSuccess: () => toast.success(`${name || 'Candidate'} restored to Applied`) },
    )
  }

  const stageLabel = (stage: string | null | undefined) => {
    switch (stage) {
      case 'applied':
      case 'evaluated':
      case 'screening':
        return 'Applied'
      case 'shortlisted':
        return 'L1 — CV Screened'
      case 'interviewing':
        return 'L2 — WA Screened'
      case 'offered':
        return 'L3 — Interviewed'
      case 'hired':
        return 'Final Shortlist'
      default:
        return stage || 'Unknown'
    }
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

  // Public application URL — backend computes this from PUBLIC_APP_URL env +
  // applicationToken. Fall back to building it client-side if the field hasn't
  // arrived yet (older cached responses).
  const publicApplyUrl = (j: typeof job) => {
    if (!j) return ''
    if (j.applicationUrl) return j.applicationUrl
    const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
    return j.applicationToken ? `${base}/apply/${j.applicationToken}` : ''
  }

  const handleShare = async () => {
    if (!job) return
    const applyUrl = publicApplyUrl(job)
    if (!applyUrl) { toast.error('No active application link for this job'); return }
    if (!job.isLinkActive) {
      toast.error('Public link is currently turned off. Re-enable it from the job view page.')
      return
    }
    try {
      await navigator.clipboard.writeText(applyUrl)
      toast.success('Apply link copied to clipboard!')
    } catch {
      toast.error('Could not copy. Try selecting the URL manually.')
    }
  }

  const handleLinkedIn = () => {
    if (!job) return
    const applyUrl = publicApplyUrl(job)
    if (!applyUrl) { toast.error('No active application link for this job'); return }
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

  const funnelStages = [
    { key: 'applied', label: 'Applied', match: ['applied','evaluated','screening','shortlisted','interviewing','offered','hired'], color: '#64748B', bg: '#F1F5F9' },
    { key: 'l1', label: 'L1', match: ['shortlisted','interviewing','offered','hired'], color: '#C9A84C', bg: '#FEF3C7' },
    { key: 'l2', label: 'L2', match: ['interviewing','offered','hired'], color: '#1D4ED8', bg: '#DBEAFE' },
    { key: 'l3', label: 'L3', match: ['offered','hired'], color: '#7C3AED', bg: '#EDE9FE' },
    { key: 'final', label: 'Final', match: ['hired'], color: '#166534', bg: '#DCFCE7' },
  ]
  const appliedTotal = candidates.filter(c => funnelStages[0].match.includes(c.pipelineStage)).length
  const finalCount = candidates.filter(c => c.pipelineStage === 'hired').length
  const conversionRate = appliedTotal > 0 ? Math.round((finalCount / appliedTotal) * 100) : 0

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Top header — title + search + all actions */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
          <div className="min-w-0 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-brand-navy truncate">{job?.title}</h1>
              {job && <JobStatusBadge status={job.status} />}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{job?.hiringCompany} · {job?.locationCity}</p>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, role, or email..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <button
              onClick={handleShare}
              className="btn-secondary text-xs gap-1.5"
              title="Share apply link"
            >
              <ShareIcon className="w-3.5 h-3.5" />
              Share
            </button>
            <button
              onClick={() => router.push(`/jobs/${id}/talent-matches`)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border-2 transition-all"
              style={{ borderColor: '#0A3D2E', color: '#0A3D2E' }}
            >
              👥 TP Matches
            </button>
            <button
              onClick={handleLinkedIn}
              className="btn-secondary text-xs gap-1.5"
              style={{color:'#0077B5', borderColor:'#0077B5'}}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isExporting || shortlistedCount === 0}
              className="btn-secondary text-xs gap-1.5"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              {isExporting ? '...' : 'Export'}
            </button>
          </div>
        </div>

        {/* Compact tabs + inline funnel strip */}
        <div className="px-6 py-2.5 bg-white border-b border-gray-200 flex items-center gap-3 flex-wrap flex-shrink-0">
          <div className="flex items-stretch gap-1.5">
            <button
              onClick={() => setTab('accepted')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                tab === 'accepted'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              <CheckCircleIcon className={clsx('w-3.5 h-3.5', tab === 'accepted' ? 'text-emerald-600' : 'text-gray-400')} />
              <span>Accepted</span>
              <span
                className={clsx(
                  'inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 rounded-full text-[10px] font-bold',
                  tab === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500',
                )}
              >
                {acceptedCandidates.length}
              </span>
            </button>
            <button
              onClick={() => setTab('rejected')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                tab === 'rejected'
                  ? 'bg-rose-50 border-rose-500 text-rose-800'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              <XCircleIcon className={clsx('w-3.5 h-3.5', tab === 'rejected' ? 'text-rose-600' : 'text-gray-400')} />
              <span>Rejected</span>
              <span
                className={clsx(
                  'inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 rounded-full text-[10px] font-bold',
                  tab === 'rejected' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-500',
                )}
              >
                {rejectedCandidates.length}
              </span>
            </button>
          </div>

          {tab === 'accepted' && (
            <div className="flex items-center gap-1.5 ml-auto overflow-x-auto">
              {funnelStages.map((s, i) => {
                const count = candidates.filter(c => s.match.includes(c.pipelineStage)).length
                const prev = i > 0 ? candidates.filter(c => funnelStages[i-1].match.includes(c.pipelineStage)).length : count
                const dropRate = prev > 0 ? Math.round((count / prev) * 100) : 0
                return (
                  <div key={s.key} className="flex items-center gap-1.5 flex-shrink-0">
                    {i > 0 && (
                      <span className="text-[10px] font-medium text-gray-400">→ {dropRate}%</span>
                    )}
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border"
                      style={{ background: s.bg, borderColor: count > 0 ? s.color + '40' : 'transparent' }}
                    >
                      <span className="text-sm font-bold leading-none" style={{ color: s.color }}>{count}</span>
                      <span className="text-[11px] font-medium leading-none" style={{ color: s.color }}>{s.label}</span>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-gray-200 flex-shrink-0">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Conv</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>{conversionRate}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Shortlist ready banner */}
        {tab === 'accepted' && hasUnreviewedShortlist && (
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


        {tab === 'accepted' && (
          <div className="flex-1 overflow-hidden">
            <KanbanBoard
              stages={STAGES}
              candidates={visibleAccepted}
              pipelineCounts={searchQuery.trim() ? null : pipelineCounts}
              onCandidateClick={(candidateId) => setSelectedCandidateId(candidateId)}
              onStageChange={handleStageChange}
            />
          </div>
        )}

        {tab === 'rejected' && (
          <div className="flex-1 overflow-auto p-6">
            {visibleRejected.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                <p className="text-sm font-semibold text-brand-navy">
                  {searchQuery.trim()
                    ? 'No rejected CVs match your search'
                    : 'No rejected CVs for this job'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {searchQuery.trim()
                    ? 'Try a different name, role, or email.'
                    : 'Rejected candidates will appear here for review or restoration.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleRejected.map((c) => {
                  const fromStage = (c as any).rejectedFromStage as string | null
                  const reason = c.aiRecommendationReason
                  return (
                    <div
                      key={c.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => setSelectedCandidateId(c.id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <h3 className="text-sm font-semibold text-brand-navy truncate hover:underline">
                            {c.fullName || 'Unknown'}
                          </h3>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {c.currentRole || '—'}
                          </p>
                        </button>
                        <button
                          onClick={() => handleRestoreFromRejected(c.id, c.fullName)}
                          disabled={updateStatusMutation.isPending}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 flex-shrink-0 disabled:opacity-50"
                          title="Restore to Applied"
                        >
                          <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                          Restore
                        </button>
                      </div>
                      {fromStage && (
                        <p className="text-[11px] text-gray-400 mt-3">
                          Rejected from{' '}
                          <span className="font-medium text-gray-600">
                            {stageLabel(fromStage)}
                          </span>
                        </p>
                      )}
                      {reason && (
                        <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{reason}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Candidate Profile Panel */}
      {selectedCandidateId && (
        <CandidatePanel
          candidateId={selectedCandidateId}
          context="pipeline"
          onClose={() => setSelectedCandidateId(null)}
          onStatusUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['job-candidates', id] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-counts', id] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          }}
        />
      )}
    </>
  )
}
