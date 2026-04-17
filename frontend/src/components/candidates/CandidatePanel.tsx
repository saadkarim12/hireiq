'use client'
// src/components/candidates/CandidatePanel.tsx
import { Fragment, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { candidatesApi } from '@/api/candidates'
import { ScoreBadge } from './ScoreBadge'
import { PipelineStageBadge } from './PipelineStageBadge'
import {
  XMarkIcon, DocumentArrowDownIcon, ExclamationTriangleIcon,
  CheckCircleIcon, HandThumbDownIcon, PauseCircleIcon,
} from '@heroicons/react/24/outline'
import type { PipelineStage, RejectionReason, CandidateFull } from '@/types'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface CandidatePanelProps {
  candidateId: string
  onClose: () => void
  onStatusUpdate?: () => void
}

const REJECTION_REASONS: { value: RejectionReason; label: string }[] = [
  { value: 'overqualified',    label: 'Overqualified' },
  { value: 'underqualified',   label: 'Underqualified' },
  { value: 'salary_mismatch',  label: 'Salary mismatch' },
  { value: 'visa',             label: 'Visa / residency issue' },
  { value: 'no_response',      label: 'No response' },
  { value: 'other',            label: 'Other' },
]

type Tab = 'summary' | 'transcript' | 'cv'

export function CandidatePanel({ candidateId, onClose, onStatusUpdate }: CandidatePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>('other')
  const [recruiterNote, setRecruiterNote] = useState('')

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => candidatesApi.get(candidateId),
  })

  const updateMutation = useMutation({
    mutationFn: (update: { pipelineStage: PipelineStage; rejectionReason?: RejectionReason; note?: string }) =>
      candidatesApi.updateStatus(candidateId, update),
    onSuccess: () => {
      toast.success('Candidate status updated')
      onStatusUpdate?.()
      if (showRejectModal) setShowRejectModal(false)
    },
    onError: () => toast.error('Failed to update status'),
  })

  const handleAdvance = () => updateMutation.mutate({ pipelineStage: 'shortlisted' })
  const handleHold = () => updateMutation.mutate({ pipelineStage: 'held' })
  const handleReject = () => updateMutation.mutate({
    pipelineStage: 'rejected',
    rejectionReason,
    note: recruiterNote || undefined,
  })

  const initials = candidate?.fullName
    ? candidate.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-panel z-50 flex flex-col slide-panel-enter">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="skeleton w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-navy/10 flex items-center justify-center">
                <span className="text-lg font-bold text-brand-navy">{initials}</span>
              </div>
            )}
            <div>
              {isLoading ? (
                <>
                  <div className="skeleton h-5 w-40 rounded mb-2" />
                  <div className="skeleton h-4 w-28 rounded" />
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-brand-navy">{candidate?.fullName || 'Unknown Candidate'}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {candidate?.currentRole && (
                      <span className="text-sm text-gray-500">{candidate.currentRole}</span>
                    )}
                    {candidate?.pipelineStage && (
                      <PipelineStageBadge stage={candidate.pipelineStage} />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scores Row */}
        {!isLoading && candidate && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-around">
              <ScoreBadge score={(candidate as any).compositeScore ?? candidate.scores?.compositeScore ?? null} size="lg" showLabel label="Overall" />
              <div className="w-px h-12 bg-gray-200" />
              <ScoreBadge score={(candidate as any).cvMatchScore ?? candidate.scores?.cvMatchScore ?? null} size="md" showLabel label="CV Match" />
              <div className="w-px h-12 bg-gray-200" />
              <ScoreBadge score={(candidate as any).commitmentScore ?? candidate.scores?.commitmentScore ?? null} size="md" showLabel label="Commitment" />
              <div className="w-px h-12 bg-gray-200" />
              <ScoreBadge score={(candidate as any).salaryFitScore ?? candidate.scores?.salaryFitScore ?? null} size="md" showLabel label="Salary Fit" />
            </div>

            {/* Authenticity flag */}
            {(candidate as any).authenticityFlag && (candidate as any).authenticityFlag !== 'none' && (
              <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  This CV shows {(candidate as any).authenticityFlag} signs of AI optimisation — verify key claims in interview
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
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

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-lg" />)}
            </div>
          ) : candidate ? (
            <>
              {/* ── Summary Tab ── */}
              {activeTab === 'summary' && (
                <div className="p-6 space-y-5">
                  {/* CV Screening Score */}
                  {((candidate as any).compositeScore || (candidate as any).cvMatchScore) && (
                    <div className="rounded-xl p-4 mb-2"
                      style={{ background: (candidate as any).compositeScore >= 75 ? '#DCFCE7' : (candidate as any).compositeScore >= 55 ? '#FEF3C7' : '#FEE2E2' }}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl font-bold"
                          style={{ color: (candidate as any).compositeScore >= 75 ? '#166534' : (candidate as any).compositeScore >= 55 ? '#92400E' : '#991B1B' }}>
                          {(candidate as any).compositeScore || (candidate as any).cvMatchScore}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">CV Screening Score</p>
                          <p className="text-xs text-gray-500">Skills + experience match against job criteria</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: 'CV Match', value: (candidate as any).cvMatchScore, weight: '40%' },
                          { label: 'Commitment', value: (candidate as any).commitmentScore, weight: '40%', pending: true },
                          { label: 'Salary Fit', value: (candidate as any).salaryFitScore, weight: '20%' },
                        ].map(({ label, value, weight, pending }) => (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-600 font-medium">{label} <span className="text-gray-400">({weight})</span></span>
                              {value
                                ? <span className="font-bold" style={{ color: value >= 75 ? '#166534' : value >= 55 ? '#92400E' : '#991B1B' }}>{value}/100</span>
                                : <span className="text-gray-400 italic">{pending ? 'After WhatsApp' : 'Pending'}</span>}
                            </div>
                            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{
                                width: value ? `${value}%` : '0%',
                                background: value >= 75 ? '#0A3D2E' : value >= 55 ? '#C9A84C' : value ? '#EF4444' : 'transparent'
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skill Evidence */}
                  {(candidate as any).dataTags?.evidence?.mustHaveSkills?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills Match</p>
                      <div className="flex flex-wrap gap-1.5">
                        {((candidate as any).dataTags?.evidence?.mustHaveSkills || []).map((s: any, i: number) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                            style={{ background: s.found ? '#DCFCE7' : '#FEE2E2', color: s.found ? '#166534' : '#991B1B' }}>
                            {s.found ? '✓' : '✗'} {s.skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}


                  {/* Skill Evidence */}
                  {(candidate as any).dataTags?.evidence?.mustHaveSkills?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills Match</p>
                      <div className="flex flex-wrap gap-1.5">
                        {((candidate as any).dataTags?.evidence?.mustHaveSkills || []).map((s: any, i: number) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                            style={{ background: s.found ? '#DCFCE7' : '#FEE2E2', color: s.found ? '#166534' : '#991B1B' }}>
                            {s.found ? '✓' : '✗'} {s.skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Summary */}
                  {candidate.aiSummary && (
                    <div className="bg-brand-blue/5 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-brand-blue uppercase tracking-wider">AI Summary</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{candidate.aiSummary}</p>
                    </div>
                  )}

                  {/* Tags */}
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

                  {/* Key Details Grid */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Salary Expectation', value: candidate.salaryExpectation ? `AED ${candidate.salaryExpectation.toLocaleString()}/mo` : 'Not stated' },
                        { label: 'Notice Period', value: candidate.noticePeriodDays !== null ? (candidate.noticePeriodDays === 0 ? 'Immediate' : `${candidate.noticePeriodDays} days`) : 'Unknown' },
                        { label: 'Visa Status', value: candidate.visaStatus || 'Not stated' },
                        { label: 'Experience', value: candidate.yearsExperience !== null ? `${candidate.yearsExperience} years` : 'Unknown' },
                        { label: 'Email', value: candidate.email || 'Not provided' },
                        { label: 'Source', value: candidate.dataTags?.sourceChannel || 'Direct' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 font-medium">{label}</p>
                          <p className="text-sm text-gray-800 font-semibold mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Skills */}
                  {candidate.cvStructured?.skills && candidate.cvStructured.skills.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {candidate.cvStructured.skills.map((skill: string) => (
                          <span key={skill} className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Experience */}
                  {candidate.cvStructured?.experience && candidate.cvStructured.experience.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Experience</p>
                      <div className="space-y-3">
                        {candidate.cvStructured.experience.slice(0, 3).map((exp: {company: string; role: string; startDate: string; endDate: string | null; description: string}, i: number) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex-shrink-0 w-1 bg-brand-blue rounded-full mt-1" />
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{exp.role}</p>
                              <p className="text-xs text-gray-500">{exp.company} · {exp.startDate} – {exp.endDate || 'Present'}</p>
                              {exp.description && (
                                <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2">{exp.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Transcript Tab ── */}
              {activeTab === 'transcript' && (
                <div className="p-6">
                  {candidate.screeningTranscript && candidate.screeningTranscript.length > 0 ? (
                    <div className="space-y-3">
                      {candidate.screeningTranscript.map((msg) => (
                        <div
                          key={msg.id}
                          className={clsx(
                            'flex',
                            msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div className={clsx(
                            'max-w-xs',
                            msg.direction === 'outbound' ? 'wa-bubble-out' : 'wa-bubble-in'
                          )}>
                            {msg.direction === 'outbound' && (
                              <p className="text-xs font-semibold text-brand-gold mb-1">🤖 AI Agent</p>
                            )}
                            <p className={clsx(
                              'text-sm leading-relaxed',
                              msg.direction === 'outbound' ? 'text-gray-800' : 'text-gray-700'
                            )}>
                              {msg.content}
                            </p>
                            {msg.answerScore !== null && (
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
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </p>
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

              {/* ── CV Tab ── */}
              {activeTab === 'cv' && (
                <div className="p-6">
                  {candidate.cvPreviewUrl ? (
                    <div className="space-y-4">
                      <a
                        href={candidate.cvPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary w-full justify-center gap-2"
                      >
                        <DocumentArrowDownIcon className="w-4 h-4" />
                        Open CV in New Tab
                      </a>
                      <p className="text-xs text-gray-400 text-center">Link expires in 1 hour for security</p>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-sm">
                        {candidate.cvType === 'wa_profile' ? 'Profile collected via WhatsApp — no CV file' :
                         candidate.cvType === 'no_submission' ? 'No CV submitted' :
                         'CV not yet available'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Action Buttons - Fixed Bottom */}
        {candidate && !isLoading && (
          <div className="border-t border-gray-200 px-6 py-4 bg-white flex items-center gap-3 flex-shrink-0">
            <button
              onClick={handleAdvance}
              disabled={updateMutation.isPending || candidate.pipelineStage === 'hired'}
              className="flex-1 btn-primary justify-center gap-2 text-sm"
            >
              <CheckCircleIcon className="w-4 h-4" />
              Advance
            </button>
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
        )}
      </div>

      {/* Reject Modal */}
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
