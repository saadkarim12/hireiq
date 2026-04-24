'use client'
// src/components/candidates/CandidatePanel.tsx
//
// Unified candidate drawer. Used in three contexts:
//   - 'talent_pool' : drawer opens from Talent Pool. Primary action: Add to Pipeline (for selected job).
//                     Shows job history. No tabs.
//   - 'cv_inbox'    : drawer opens from CV Inbox. Primary action: Approve to L1 (same flow as Pipeline Applied).
//                     Secondary: Add to Pool / Reject. No tabs.
//   - 'pipeline'    : drawer opens from the job pipeline kanban. Primary action: Approve to [next Lx] per current stage.
//                     Tabs: Summary / WhatsApp Chat / CV.
//
// Score section is stage-aware regardless of context:
//   - Applied / pre-screening  -> TP-style gold "Match for:" card with CV Match + ✓/✗ skill chips + hard filter
//   - Shortlisted during sim   -> "🔄 WhatsApp screening in progress…" banner
//   - L1+ post-screening       -> full 4-circle breakdown (Composite, CV Match, Commitment, Salary Fit)

import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { candidatesApi } from '@/api/candidates'
import { api } from '@/api/client'
import { ScoreBadge } from './ScoreBadge'
import { PipelineStageBadge } from './PipelineStageBadge'
import { AiRecommendationBadge } from './AiRecommendationBadge'
import {
  XMarkIcon, DocumentArrowDownIcon, ExclamationTriangleIcon,
  CheckCircleIcon, HandThumbDownIcon, PauseCircleIcon,
} from '@heroicons/react/24/outline'
import type { PipelineStage, RejectionReason, CandidateFull } from '@/types'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export type PanelContext = 'talent_pool' | 'cv_inbox' | 'pipeline'

interface CandidatePanelProps {
  candidateId: string
  context: PanelContext
  /** TP with a selected job: drives "Match for:" framing. TP without jobId: drawer disables primary action. */
  jobId?: string
  jobTitle?: string
  /** List-object data for instant paint. TanStack Query refreshes in the background. */
  initialData?: Partial<CandidateFull> & { id: string }
  onClose: () => void
  /** Called after any stage/status change so the parent page can invalidate its queries. */
  onStatusUpdate?: () => void
  /** TP only: invoked when recruiter clicks "Add to Pipeline". Parent owns the mutation. */
  onAddToPipeline?: () => void
  /** CV Inbox only: invoked when recruiter clicks "Add to Pool". Parent owns the mutation. */
  onAddToPool?: () => void
}

const REJECTION_REASONS: { value: RejectionReason; label: string }[] = [
  { value: 'overqualified',    label: 'Overqualified' },
  { value: 'underqualified',   label: 'Underqualified' },
  { value: 'salary_mismatch',  label: 'Salary mismatch' },
  { value: 'visa',             label: 'Visa / residency issue' },
  { value: 'no_response',      label: 'No response' },
  { value: 'other',            label: 'Other' },
]

// Stage → next stage + next-level label. One "Approve to Lx" per stage.
const NEXT_STAGE_FROM: Record<string, { stage: PipelineStage; label: string }> = {
  applied:      { stage: 'shortlisted',  label: 'L1' },
  screening:    { stage: 'shortlisted',  label: 'L1' },
  evaluated:    { stage: 'shortlisted',  label: 'L1' },
  shortlisted:  { stage: 'interviewing', label: 'L2' },
  interviewing: { stage: 'offered',      label: 'L3' },
  offered:      { stage: 'hired',        label: 'Final' },
}

type Tab = 'summary' | 'transcript' | 'cv'

export function CandidatePanel({
  candidateId, context, jobId, jobTitle, initialData,
  onClose, onStatusUpdate, onAddToPipeline, onAddToPool,
}: CandidatePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>('other')
  const [recruiterNote, setRecruiterNote] = useState('')
  const queryClient = useQueryClient()

  // Fresh data. initialData gives instant paint — Query refreshes in background without blanking the UI
  // (TanStack keeps previous data during refetch by default, so there's no flicker).
  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => candidatesApi.get(candidateId),
    initialData: initialData as CandidateFull | undefined,
  })

  const updateMutation = useMutation({
    mutationFn: (update: { pipelineStage: PipelineStage; rejectionReason?: RejectionReason; note?: string }) =>
      candidatesApi.updateStatus(candidateId, update),
    onSuccess: () => {
      toast.success('Candidate status updated')
      // Any stage change affects dashboard KPIs (In Screening, Shortlisted, Conversion Rate, Recent Activity).
      // One call invalidates all four dashboard queries via the shared 'dashboard' prefix.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onStatusUpdate?.()
      if (showRejectModal) setShowRejectModal(false)
      if (showApproveConfirm) setShowApproveConfirm(false)
    },
    onError: () => toast.error('Failed to update status'),
  })

  const handleHold = () => updateMutation.mutate({ pipelineStage: 'held' })
  const handleReject = () => updateMutation.mutate({
    pipelineStage: 'rejected',
    rejectionReason,
    note: recruiterNote || undefined,
  })
  const handleApprove = () => {
    if (!nextTransition) return
    updateMutation.mutate({ pipelineStage: nextTransition.stage })
  }

  // ── Normalised score access. API returns scores flat + nested; prefer typed nested path.
  const s = (key: 'compositeScore' | 'cvMatchScore' | 'commitmentScore' | 'salaryFitScore'): number | null => {
    const nested = candidate?.scores?.[key]
    if (nested !== undefined && nested !== null) return nested
    const flat = (candidate as any)?.[key]
    return flat !== undefined && flat !== null ? flat : null
  }

  const stage = candidate?.pipelineStage || 'applied'
  const isPreScreening = stage === 'applied' || stage === 'evaluated' || stage === 'screening'
  const convState = (candidate as any)?.conversationState
  const isScreeningInProgress = stage === 'shortlisted' && typeof convState === 'string' && convState.startsWith('screening_q')
  const nextTransition = NEXT_STAGE_FROM[stage]

  const fullName = candidate?.fullName || (initialData as any)?.fullName || 'Unknown'
  const currentRole = candidate?.currentRole || (initialData as any)?.currentRole
  const initials = fullName
    ? fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  const mustHaveSkills: Array<{ skill: string; found: boolean }> = (candidate as any)?.dataTags?.evidence?.mustHaveSkills || []
  const skills: string[] = candidate?.cvStructured?.skills || []
  const experience: Array<any> = candidate?.cvStructured?.experience || []
  const education: any = candidate?.cvStructured?.education
  const certifications: any[] = candidate?.cvStructured?.certifications || []

  // TP shows a "Download CV" — make it available everywhere
  const cvDownloadUrl = (candidate as any)?.cvPreviewUrl || (candidate as any)?.cvFileUrl

  const handleDownloadCV = async () => {
    if (!candidate) return
    try {
      const res = await api.get(`/candidates/${candidate.id}/cv-download`)
      const url = (res.data as any)?.data?.url
      if (url) window.open(url, '_blank')
      else toast.error('CV download unavailable')
    } catch {
      toast.error('CV download failed')
    }
  }

  // Pipeline uses tabs; TP and CV Inbox use a single scrolling column.
  const useTabs = context === 'pipeline'

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-panel z-50 flex flex-col slide-panel-enter">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            {isLoading && !candidate ? (
              <div className="skeleton w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-brand-navy">{initials}</span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-brand-navy">{fullName}</h2>
              <div className="flex items-center gap-2 mt-1">
                {currentRole && (
                  <span className="text-sm text-gray-500">{currentRole}</span>
                )}
                {/* Right-side context: stage badge in pipeline, job-match pill in TP, source pill in CV Inbox */}
                {context === 'pipeline' && candidate?.pipelineStage && (
                  <PipelineStageBadge stage={candidate.pipelineStage} />
                )}
                {context === 'talent_pool' && jobTitle && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                    {jobTitle}
                  </span>
                )}
                {context === 'cv_inbox' && candidate?.dataTags?.sourceChannel && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize bg-gray-100 text-gray-600">
                    {String(candidate.dataTags.sourceChannel).replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Score Section ──────────────────────────────────────────────── */}
        {candidate && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            {isScreeningInProgress ? (
              <div className="flex items-center justify-center gap-3 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="inline-block animate-spin text-xl">🔄</span>
                <div className="text-center">
                  <p className="text-sm font-medium text-blue-800">WhatsApp screening in progress…</p>
                  <p className="text-xs text-blue-600 mt-0.5">Usually ~20s. The card will update automatically.</p>
                </div>
              </div>
            ) : isPreScreening ? (
              // TP-style gold card as canonical Applied-stage score treatment
              <div className="rounded-xl border-2 p-4" style={{ borderColor: '#C9A84C66', background: '#FDF6E3' }}>
                {(context === 'talent_pool' && jobTitle) && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-center mb-2" style={{ color: '#92400E' }}>
                    Match for: {jobTitle}
                  </p>
                )}
                <div className="flex items-center justify-center gap-5">
                  <div className="text-center">
                    <div className="text-5xl font-bold leading-none"
                      style={{ color: (s('cvMatchScore') ?? 0) >= 75 ? '#166534' : (s('cvMatchScore') ?? 0) >= 55 ? '#92400E' : '#991B1B' }}>
                      {s('cvMatchScore') ?? '—'}
                    </div>
                    <p className="text-xs font-semibold text-gray-700 mt-1">CV Screening Score</p>
                    <p className="text-[10px] text-gray-500">Skills + experience match</p>
                  </div>
                  <div className="w-px h-14 bg-amber-200/70" />
                  <div className="flex flex-col gap-1 opacity-60">
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-1 h-1 rounded-full bg-gray-400" /> Commitment · after WhatsApp</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-1 h-1 rounded-full bg-gray-400" /> Salary Fit · after WhatsApp</div>
                  </div>
                </div>

                {mustHaveSkills.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-amber-200/50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Required Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mustHaveSkills.map((sk, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-md font-medium"
                          style={{ background: sk.found ? '#DCFCE7' : '#FEE2E2', color: sk.found ? '#166534' : '#991B1B' }}>
                          {sk.found ? '✓' : '✗'} {sk.skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {candidate.hardFilterPass !== undefined && candidate.hardFilterPass !== null && (
                  <div className="mt-2 text-[10px] text-center">
                    {candidate.hardFilterPass
                      ? <span className="text-green-700 font-medium">✓ Passes all required filters</span>
                      : <span className="text-red-700 font-medium">✗ {candidate.hardFilterFailReason || 'Fails required filters'}</span>}
                  </div>
                )}
              </div>
            ) : (s('compositeScore') == null && s('cvMatchScore') == null &&
                 s('commitmentScore') == null && s('salaryFitScore') == null) ? (
              // 7.6.a.i — L1+ candidate with no scores at all. Legacy data from before
              // automated scoring was available. Show an honest card instead of four dashes.
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-center">
                <p className="text-sm text-gray-600 font-medium">Scores not captured</p>
                <p className="text-xs text-gray-400 mt-1">
                  This candidate was promoted before automated scoring was available.
                </p>
              </div>
            ) : (
              // L1+ post-screening: full 4-circle breakdown
              <div className="flex items-center justify-around">
                <ScoreBadge score={s('compositeScore')}  size="lg" showLabel label="Overall" />
                <div className="w-px h-12 bg-gray-200" />
                <ScoreBadge score={s('cvMatchScore')}    size="md" showLabel label="CV Match" />
                <div className="w-px h-12 bg-gray-200" />
                <ScoreBadge score={s('commitmentScore')} size="md" showLabel label="Commitment" />
                <div className="w-px h-12 bg-gray-200" />
                <ScoreBadge score={s('salaryFitScore')}  size="md" showLabel label="Salary Fit" />
              </div>
            )}

            {/* Authenticity flag (CV-polished warning) */}
            {candidate.authenticityFlag && candidate.authenticityFlag !== 'none' && !isScreeningInProgress && (
              <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  This CV shows {candidate.authenticityFlag} signs of AI optimisation — verify key claims in interview
                </p>
              </div>
            )}

            {/* AI Recommendation */}
            <div className="mt-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <AiRecommendationBadge
                    recommendation={(candidate as any).aiRecommendation ?? null}
                    pipelineStage={candidate.pipelineStage}
                    size="md"
                  />
                  {(candidate as any).aiRecommendationReason && (
                    <p className="text-xs text-gray-600 truncate">
                      {(candidate as any).aiRecommendationReason}
                    </p>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-400 flex-shrink-0">
                  Recruiter decides
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs (pipeline only) ───────────────────────────────────────── */}
        {useTabs && (
          <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
            {(['summary', 'transcript', 'cv'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={clsx(
                  'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                  activeTab === tab
                    ? 'border-brand-blue text-brand-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {tab === 'transcript' ? 'WhatsApp Chat' : tab}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && !candidate ? (
            <div className="p-6 space-y-4">
              {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-lg" />)}
            </div>
          ) : candidate ? (
            <>
              {/* Summary content — always shown for TP/CV Inbox, under Summary tab in pipeline */}
              {(!useTabs || activeTab === 'summary') && (
                <div className="p-6 space-y-5">
                  {/* Key details grid */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Salary Expectation', value: candidate.salaryExpectation ? `AED ${candidate.salaryExpectation.toLocaleString()}/mo` : 'Not stated' },
                        { label: 'Notice Period', value: candidate.noticePeriodDays != null ? (candidate.noticePeriodDays === 0 ? 'Immediate' : `${candidate.noticePeriodDays} days`) : 'Unknown' },
                        { label: 'Visa Status', value: candidate.visaStatus || 'Not stated' },
                        { label: 'Experience', value: candidate.yearsExperience != null ? `${candidate.yearsExperience} years` : 'Unknown' },
                        { label: 'Email', value: candidate.email || 'Not provided' },
                        { label: 'Source', value: (candidate.dataTags as any)?.sourceChannel || candidate.sourceChannel || 'Direct' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 font-medium">{label}</p>
                          <p className="text-sm text-gray-800 font-semibold mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Profile tags */}
                  {(candidate.dataTags?.seniorityLevel || candidate.dataTags?.roleCategory ||
                    candidate.dataTags?.languageCapability || candidate.dataTags?.availability) && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Profile Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {candidate.dataTags?.seniorityLevel && (
                          <span className="px-2.5 py-1 bg-brand-navy text-white text-xs font-semibold rounded-full">
                            {candidate.dataTags.seniorityLevel}
                          </span>
                        )}
                        {candidate.dataTags?.roleCategory && (
                          <span className="px-2.5 py-1 bg-brand-blue/10 text-brand-blue text-xs font-semibold rounded-full">
                            {candidate.dataTags.roleCategory}
                          </span>
                        )}
                        {candidate.dataTags?.languageCapability && (
                          <span className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full">
                            {candidate.dataTags.languageCapability}
                          </span>
                        )}
                        {candidate.dataTags?.availability && (
                          <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full">
                            Available: {candidate.dataTags.availability}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI summary */}
                  {candidate.aiSummary && (
                    <div className="bg-brand-blue/5 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-brand-blue uppercase tracking-wider">AI Summary</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{candidate.aiSummary}</p>
                    </div>
                  )}

                  {/* CV details — Skills / Work Experience / Education / Certifications.
                      Shown here (outside tabs) for TP + CV Inbox. In pipeline, shown under the CV tab. */}
                  {!useTabs && (
                    <CvDetailsBlock
                      skills={skills}
                      experience={experience}
                      education={education}
                      certifications={certifications}
                    />
                  )}

                  {/* Job History — TP only */}
                  {context === 'talent_pool' && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Applied Jobs</p>
                      <div className="space-y-2">
                        <div className="p-3 rounded-xl border border-gray-100">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-800">
                              {(candidate.dataTags as any)?.jobTitle || candidate.currentRole || 'Most recent application'}
                            </p>
                            {s('compositeScore') != null && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                                {s('compositeScore')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 capitalize">
                            {candidate.pipelineStage?.replace(/_/g, ' ')} · {candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pipeline Transcript tab */}
              {useTabs && activeTab === 'transcript' && (
                <div className="p-6">
                  {candidate.screeningTranscript && candidate.screeningTranscript.length > 0 ? (
                    <div className="space-y-3">
                      {candidate.screeningTranscript.map((msg) => (
                        <div key={msg.id} className={clsx('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                          <div className={clsx('max-w-xs', msg.direction === 'outbound' ? 'wa-bubble-out' : 'wa-bubble-in')}>
                            {msg.direction === 'outbound' && (
                              <p className="text-xs font-semibold text-brand-gold mb-1">🤖 AI Agent</p>
                            )}
                            <p className={clsx('text-sm leading-relaxed', msg.direction === 'outbound' ? 'text-gray-800' : 'text-gray-700')}>
                              {msg.content}
                            </p>
                            {msg.answerScore !== null && msg.answerScore !== undefined && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <div className={clsx(
                                  'text-xs font-semibold px-1.5 py-0.5 rounded',
                                  msg.answerScore >= 70 ? 'bg-green-100 text-green-700' :
                                  msg.answerScore >= 50 ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-600'
                                )}>
                                  Score: {msg.answerScore}/100
                                </div>
                                {msg.answerQuality && (
                                  <span className="text-xs text-gray-400 capitalize">{msg.answerQuality}</span>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-sm">No transcript available yet</p>
                      <p className="text-xs mt-1">Conversation will appear here once candidate completes screening</p>
                    </div>
                  )}
                </div>
              )}

              {/* Pipeline CV tab */}
              {useTabs && activeTab === 'cv' && (
                <div className="p-6 space-y-5">
                  <CvDetailsBlock
                    skills={skills}
                    experience={experience}
                    education={education}
                    certifications={certifications}
                  />
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ── Action Buttons ─────────────────────────────────────────────── */}
        {candidate && !isLoading && (
          <div className="border-t border-gray-200 px-6 py-4 bg-white flex-shrink-0">
            {context === 'talent_pool' ? (
              <div className="space-y-2">
                {jobId ? (
                  <button
                    onClick={onAddToPipeline}
                    className="w-full py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2"
                    style={{ background: '#0A3D2E' }}
                  >
                    📥 Add to Pipeline
                  </button>
                ) : (
                  <div className="p-3 rounded-xl text-xs text-center" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    Select a job using "Match to job" above to invite this candidate
                  </div>
                )}
                {cvDownloadUrl && (
                  <button onClick={handleDownloadCV} className="w-full btn-secondary text-sm gap-1.5">
                    <DocumentArrowDownIcon className="w-4 h-4" /> Download CV
                  </button>
                )}
              </div>
            ) : context === 'cv_inbox' ? (
              <div className="space-y-2">
                <button
                  onClick={() => setShowApproveConfirm(true)}
                  disabled={updateMutation.isPending || isScreeningInProgress}
                  className="w-full btn-primary justify-center gap-2 text-sm"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Approve to L1
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={onAddToPool}
                    className="flex-1 btn-secondary text-sm"
                  >
                    + Add to Pool
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="flex-1 btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-sm"
                  >
                    ✗ Reject
                  </button>
                </div>
                {cvDownloadUrl && (
                  <button onClick={handleDownloadCV} className="w-full btn-secondary text-sm gap-1.5">
                    <DocumentArrowDownIcon className="w-4 h-4" /> Download CV
                  </button>
                )}
              </div>
            ) : (
              // Pipeline
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {nextTransition ? (
                    <button
                      onClick={() => {
                        if (isPreScreening) setShowApproveConfirm(true)
                        else handleApprove()
                      }}
                      disabled={updateMutation.isPending || isScreeningInProgress}
                      className="flex-1 btn-primary justify-center gap-2 text-sm"
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      {isScreeningInProgress ? 'Screening in progress…' : `Approve to ${nextTransition.label}`}
                    </button>
                  ) : (
                    <div className="flex-1 text-center text-xs text-gray-400 py-2">No further stages — candidate is hired</div>
                  )}
                  <button
                    onClick={handleHold}
                    disabled={updateMutation.isPending}
                    className="px-4 py-2 btn-secondary text-amber-600 border-amber-200 hover:bg-amber-50 text-sm"
                  >
                    <PauseCircleIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={updateMutation.isPending || candidate.pipelineStage === 'rejected'}
                    className="px-4 py-2 btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-sm"
                  >
                    <HandThumbDownIcon className="w-4 h-4" />
                  </button>
                </div>
                {cvDownloadUrl && (
                  <button onClick={handleDownloadCV} className="w-full btn-secondary text-sm gap-1.5">
                    <DocumentArrowDownIcon className="w-4 h-4" /> Download CV
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Approve-to-L1 confirmation modal (shared across cv_inbox + pipeline-Applied) ── */}
      {showApproveConfirm && candidate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowApproveConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="w-6 h-6 text-brand-navy" />
              <h3 className="text-base font-bold text-brand-navy">Approve to L1?</h3>
            </div>
            <p className="text-sm text-gray-700">
              Approve <span className="font-semibold">{fullName}</span> to Level 1? This starts WhatsApp screening — 5 personalised questions will be sent and evaluated by AI.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Once started, screening is irreversible — the candidate receives the 5 questions immediately.
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowApproveConfirm(false)} className="flex-1 btn-secondary text-sm">Cancel</button>
              <button
                onClick={handleApprove}
                disabled={updateMutation.isPending}
                className="flex-1 btn-primary text-sm"
              >
                {updateMutation.isPending ? 'Approving…' : 'Yes, approve to L1'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ─────────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-brand-navy">Reject Candidate</h3>
            <div>
              <label className="label">Rejection Reason</label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value as RejectionReason)}
                className="input text-sm"
              >
                {REJECTION_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Note <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={recruiterNote}
                onChange={(e) => setRecruiterNote(e.target.value)}
                rows={3}
                className="input text-sm resize-none"
                placeholder="Internal note for the team..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={updateMutation.isPending}
                className="flex-1 btn-danger text-sm"
              >
                {updateMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── CV Details block (Skills / Work Experience / Education / Certifications) ──
function CvDetailsBlock({
  skills, experience, education, certifications,
}: {
  skills: string[]
  experience: any[]
  education: any
  certifications: any[]
}) {
  return (
    <div className="space-y-5">
      {skills.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span key={skill} className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Work Experience</p>
          <div className="space-y-2">
            {experience.slice(0, 4).map((exp: any, i: number) => (
              <div key={i} className="p-3 rounded-xl border border-gray-100">
                <p className="text-sm font-medium text-gray-800">{exp.role || exp.title || 'Role'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {exp.company || 'Company'}
                  {(exp.startDate || exp.period || exp.duration) ? ` · ${exp.startDate ? `${exp.startDate} – ${exp.endDate || 'Present'}` : (exp.period || exp.duration)}` : ''}
                </p>
                {exp.description && (
                  <p className="text-xs text-gray-600 mt-1.5 leading-relaxed line-clamp-3">
                    {exp.description.slice(0, 220)}{exp.description.length > 220 ? '…' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {education && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Education</p>
          <div className="p-3 rounded-xl border border-gray-100 text-sm text-gray-700">
            {typeof education === 'string' ? education : (
              Array.isArray(education) ? education.map((e: any, i: number) => (
                <div key={i}>{e.degree || e.field || ''} {e.institution ? `· ${e.institution}` : ''} {e.year ? `· ${e.year}` : ''}</div>
              )) : JSON.stringify(education).slice(0, 240)
            )}
          </div>
        </div>
      )}

      {certifications.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Certifications</p>
          <div className="flex flex-wrap gap-1.5">
            {certifications.slice(0, 10).map((c: any, i: number) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                {typeof c === 'string' ? c : (c.name || c.title || JSON.stringify(c))}
                {typeof c === 'object' && c.year ? ` (${c.year})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
