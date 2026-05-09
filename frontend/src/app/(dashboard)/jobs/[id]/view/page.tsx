'use client'
// src/app/(dashboard)/jobs/[id]/view/page.tsx
//
// Read-only detail view of a single job. Shows everything the wizard captures
// plus the AI-derived screening criteria and baseline questions. Exposes
// status-aware actions (Edit / Resume / Publish / Archive / Unarchive / Delete)
// at the top, with a single confirmation modal driven by JOB_ACTIONS copy.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, BriefcaseIcon, MapPinIcon, BanknotesIcon, ClockIcon, LanguageIcon, CalendarIcon, SparklesIcon, CheckBadgeIcon, LinkIcon, ArrowPathIcon, ClipboardDocumentIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import { jobsApi } from '@/api/jobs'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import {
  JOB_STATUS,
  JOB_ACTIONS,
  JOB_ACTIONS_BY_STATUS,
  QUESTION_CATEGORY_LABELS,
  QUESTION_CATEGORY_BADGE,
  type QuestionCategory,
} from '@/lib/constants'
import type { Job, ScreeningQuestion } from '@/types'

interface PageProps { params: { id: string } }

type ActionKey = keyof typeof JOB_ACTIONS

export default function ViewJobPage({ params }: PageProps) {
  const id = (params as any).id
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null)

  const { data: job, isLoading, error } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] })
    queryClient.invalidateQueries({ queryKey: ['job', id] })
  }

  // One mutation per lifecycle action — keeps onSuccess routing per-action clear.
  const archiveMutation = useMutation({
    mutationFn: () => jobsApi.updateStatus(id, 'archived'),
    onSuccess: () => { invalidate(); toast.success('Job archived') },
    onError: () => toast.error('Failed to archive job'),
  })
  const unarchiveMutation = useMutation({
    mutationFn: () => jobsApi.unarchive(id),
    onSuccess: () => { invalidate(); toast.success('Job restored to active') },
    onError: () => toast.error('Failed to unarchive job'),
  })
  const publishMutation = useMutation({
    mutationFn: () => jobsApi.activate(id),
    onSuccess: () => { invalidate(); toast.success('Draft published — job is live'); router.push(`/jobs/${id}/pipeline`) },
    onError: () => toast.error('Failed to publish draft'),
  })
  const deleteMutation = useMutation({
    mutationFn: () => jobsApi.remove(id),
    onSuccess: () => { invalidate(); toast.success('Draft deleted'); router.push('/jobs') },
    onError: () => toast.error('Failed to delete draft'),
  })

  // Routing-only actions: VIEW (no-op here, you're on it), EDIT/RESUME (link).
  const handleAction = (key: ActionKey) => {
    if (key === 'EDIT' || key === 'RESUME') { router.push(`/jobs/${id}/edit`); return }
    if (key === 'VIEW') return
    // Confirm-then-execute actions need the modal
    setPendingAction(key)
  }

  const confirmPendingAction = () => {
    if (!pendingAction) return
    switch (pendingAction) {
      case 'ARCHIVE':   archiveMutation.mutate();   break
      case 'UNARCHIVE': unarchiveMutation.mutate(); break
      case 'PUBLISH':   publishMutation.mutate();   break
      case 'DELETE':    deleteMutation.mutate();    break
    }
    setPendingAction(null)
  }

  const isMutating =
    archiveMutation.isPending ||
    unarchiveMutation.isPending ||
    publishMutation.isPending ||
    deleteMutation.isPending

  if (isLoading) return <ViewJobSkeleton />
  if (error || !job) return <ViewJobError onBack={() => router.push('/jobs')} />

  // View screen renders the action set as buttons. Drop 'VIEW' since it's a
  // no-op here (you're already on the view screen) — it only belongs in the
  // card kebab menu, where it's the entry point to this screen.
  const actionKeys = JOB_ACTIONS_BY_STATUS[job.status].filter(k => k !== 'VIEW')
  const screeningQuestions = (job.screeningQuestions || []) as ScreeningQuestion[]
  const extractedCriteria = job.extractedCriteria as { mustHave?: string[]; niceToHave?: string[]; seniorityLevel?: string; roleCategory?: string } | null

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Back nav */}
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 -ml-1">
        <ArrowLeftIcon className="w-4 h-4" />
        Back to jobs
      </Link>

      {/* Header card */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-brand-navy truncate">{job.title}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-sm text-gray-500">{job.hiringCompany}</p>
          </div>

          {/* Status-aware actions */}
          <div className="flex items-center gap-2 shrink-0">
            {actionKeys.map((key, idx) => {
              const action = JOB_ACTIONS[key]
              const isPrimary = idx === 0
              const isDestructive = key === 'DELETE'
              return (
                <button
                  key={key}
                  onClick={() => handleAction(key)}
                  disabled={isMutating}
                  className={clsx(
                    'text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50',
                    isDestructive ? 'bg-red-50 text-red-700 hover:bg-red-100' :
                    isPrimary    ? 'btn-primary' :
                                   'btn-secondary',
                  )}
                >
                  {action.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tombstone metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100 text-xs">
          <Tombstone icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Created"   value={format(new Date(job.createdAt), 'd MMM yyyy')} />
          <Tombstone icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Activated" value={job.activatedAt ? format(new Date(job.activatedAt), 'd MMM yyyy') : '—'} />
          <Tombstone icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Archived"  value={job.archivedAt ? format(new Date(job.archivedAt), 'd MMM yyyy') : '—'} />
          <Tombstone icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Closing"   value={job.closingDate ? format(new Date(job.closingDate), 'd MMM yyyy') : '—'} />
        </div>
      </div>

      {/* Public application link — only meaningful for active jobs */}
      {job.status === 'active' && (
        <PublicLinkCard job={job} />
      )}

      {/* Role basics */}
      <Section title="Role Basics" icon={<BriefcaseIcon className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Location"    icon={<MapPinIcon  className="w-3.5 h-3.5" />} value={`${job.locationCity}, ${job.locationCountry}`} />
          <Field label="Work Mode"   icon={<BriefcaseIcon className="w-3.5 h-3.5" />} value={<span className="capitalize">{job.jobType}</span>} />
          <Field label="Salary"      icon={<BanknotesIcon className="w-3.5 h-3.5" />} value={`${job.currency} ${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()} / month`} />
          <Field label="Min experience" icon={<ClockIcon className="w-3.5 h-3.5" />} value={`${job.minExperienceYears} year${job.minExperienceYears === 1 ? '' : 's'}`} />
          <Field label="Languages"   icon={<LanguageIcon className="w-3.5 h-3.5" />} value={job.requiredLanguages.join(', ') || '—'} />
        </div>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Required</p>
            <SkillTags skills={job.requiredSkills} required />
          </div>
          {job.preferredSkills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Preferred</p>
              <SkillTags skills={job.preferredSkills} />
            </div>
          )}
        </div>
      </Section>

      {/* Job description */}
      <Section title="Job Description">
        {job.jdText ? (
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{job.jdText}</pre>
        ) : (
          <p className="text-sm text-gray-400 italic">No job description on file.</p>
        )}
      </Section>

      {/* AI screening criteria */}
      <Section title="AI Screening Criteria" icon={<SparklesIcon className="w-4 h-4 text-brand-gold" />}>
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
            <strong>Hard filters (always on):</strong> candidates failing either are auto-rejected before scoring.
            <ul className="mt-1.5 ml-4 list-disc">
              <li>Minimum experience: <strong>{job.minExperienceYears} year{job.minExperienceYears === 1 ? '' : 's'}</strong></li>
              <li>Required skills: <strong>{job.requiredSkills.length || 0} skill{job.requiredSkills.length === 1 ? '' : 's'}</strong></li>
            </ul>
          </div>

          {extractedCriteria && (extractedCriteria.mustHave?.length || extractedCriteria.niceToHave?.length) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">AI extracted — must have</p>
                {extractedCriteria.mustHave?.length ? (
                  <SkillTags skills={extractedCriteria.mustHave} required />
                ) : (
                  <p className="text-sm text-gray-400">—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">AI extracted — nice to have</p>
                {extractedCriteria.niceToHave?.length ? (
                  <SkillTags skills={extractedCriteria.niceToHave} />
                ) : (
                  <p className="text-sm text-gray-400">—</p>
                )}
              </div>
              {extractedCriteria.seniorityLevel && (
                <Field label="Seniority level" value={<span className="capitalize">{extractedCriteria.seniorityLevel}</span>} />
              )}
              {extractedCriteria.roleCategory && (
                <Field label="Role category" value={<span className="capitalize">{extractedCriteria.roleCategory}</span>} />
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">AI criteria not yet generated.</p>
          )}
        </div>
      </Section>

      {/* Baseline questions */}
      <Section title="Baseline Screening Questions" icon={<CheckBadgeIcon className="w-4 h-4 text-brand-blue" />}>
        {screeningQuestions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No screening questions on file. Drafts have these generated when AI runs at the end of the wizard.</p>
        ) : (
          <ol className="space-y-3">
            {screeningQuestions.map((q, i) => {
              const cat = (q as any).category as QuestionCategory | undefined
              const badgeStyle = cat ? QUESTION_CATEGORY_BADGE[cat] : null
              return (
                <li key={q.id || i} className="border border-gray-100 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-gray-400 mt-0.5">Q{i + 1}.</span>
                    <p className="text-sm text-gray-800 flex-1">{q.questionTextEn}</p>
                    {cat && badgeStyle && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide"
                        style={{ background: badgeStyle.bg, color: badgeStyle.fg }}
                      >
                        {QUESTION_CATEGORY_LABELS[cat]}
                      </span>
                    )}
                  </div>
                  {q.questionTextAr && (
                    <p className="text-xs text-gray-500 ml-6" dir="rtl">{q.questionTextAr}</p>
                  )}
                  {q.rationale && (
                    <p className="text-xs text-gray-400 italic ml-6">Why we ask: {q.rationale}</p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Section>

      {/* Confirmation modal */}
      {pendingAction && pendingAction in JOB_ACTIONS && (() => {
        const action = JOB_ACTIONS[pendingAction] as { confirm?: { title: string; body: string; confirm: string; cancel: string } }
        if (!action.confirm) return null
        const isDestructive = pendingAction === 'DELETE'
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setPendingAction(null)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h3 className="text-base font-bold text-brand-navy">{action.confirm.title}</h3>
              <p className="text-sm text-gray-700">{action.confirm.body}</p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setPendingAction(null)} className="flex-1 btn-secondary text-sm" disabled={isMutating}>
                  {action.confirm.cancel}
                </button>
                <button
                  onClick={confirmPendingAction}
                  disabled={isMutating}
                  className={clsx('flex-1 text-sm', isDestructive ? 'bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50' : 'btn-primary')}
                >
                  {isMutating ? 'Working…' : action.confirm.confirm}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-6 space-y-3">
      <h2 className="text-sm font-bold text-brand-navy flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, icon, value }: { label: string; icon?: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 inline-flex items-center gap-1">{icon}{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}

function Tombstone({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-400 inline-flex items-center gap-1">{icon}{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  )
}

function SkillTags({ skills, required }: { skills: string[]; required?: boolean }) {
  if (!skills.length) return <p className="text-sm text-gray-400">—</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map(s => (
        <span
          key={s}
          className={clsx(
            'px-2.5 py-0.5 rounded-full text-xs font-medium',
            required ? 'bg-brand-blue/10 text-brand-blue' : 'bg-gray-100 text-gray-700',
          )}
        >
          {s}
        </span>
      ))}
    </div>
  )
}

function ViewJobSkeleton() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="skeleton h-4 w-24 rounded" />
      <div className="card p-6 space-y-3">
        <div className="skeleton h-6 w-1/2 rounded" />
        <div className="skeleton h-4 w-1/3 rounded" />
      </div>
      {[1,2,3].map(i => <div key={i} className="card p-6"><div className="skeleton h-32 w-full rounded" /></div>)}
    </div>
  )
}

function ViewJobError({ onBack }: { onBack: () => void }) {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="card py-16 text-center">
        <p className="text-base font-semibold text-gray-700">Job not found</p>
        <p className="text-sm text-gray-400 mt-1 mb-5">It may have been deleted, or you don't have access.</p>
        <button onClick={onBack} className="btn-primary inline-flex">Back to jobs</button>
      </div>
    </div>
  )
}

// ── Public application link card (v1.12.0) ───────────────────────────────────
// Recruiter can copy/open the public /apply/:token URL, toggle it off, or
// regenerate the token if it leaks. Only rendered for active jobs since the
// link is meaningless for drafts/archives.
function PublicLinkCard({ job }: { job: Job }) {
  const queryClient = useQueryClient()
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const url = job.applicationUrl || ''

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) => jobsApi.setLinkStatus(job.id, { isLinkActive: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      toast.success('Link status updated')
    },
    onError: () => toast.error('Failed to update link status'),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => jobsApi.regenerateApplicationToken(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      toast.success('Token regenerated. Old link no longer works.')
      setConfirmRegenerate(false)
    },
    onError: () => {
      toast.error('Failed to regenerate token')
      setConfirmRegenerate(false)
    },
  })

  const onCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Could not copy. Try selecting the URL.')
    }
  }

  return (
    <>
      <div className="card p-6 space-y-3 border-l-4 border-l-brand-gold">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-brand-gold" />
            <h2 className="text-sm font-bold text-brand-navy">Public Application Link</h2>
            {!job.isLinkActive && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Inactive</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <span>Active</span>
            <input
              type="checkbox"
              checked={job.isLinkActive}
              disabled={toggleMutation.isPending}
              onChange={e => toggleMutation.mutate(e.target.checked)}
              className="w-9 h-5 appearance-none bg-gray-200 rounded-full relative cursor-pointer transition-colors checked:bg-brand-gold disabled:opacity-50
                before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:bg-white before:rounded-full before:transition-transform
                checked:before:translate-x-4"
            />
          </label>
        </div>

        <p className="text-xs text-gray-600">
          Share this link in LinkedIn posts, outreach emails, or your careers page. Candidates apply
          directly — submissions that pass the hard filters land in your Applied column automatically.
        </p>

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700"
          />
          <button
            onClick={onCopy}
            disabled={!url}
            className="btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-2 disabled:opacity-50"
            title="Copy to clipboard"
          >
            <ClipboardDocumentIcon className="w-3.5 h-3.5" /> Copy
          </button>
          <a
            href={url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx('btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-2', !url && 'opacity-50 pointer-events-none')}
            title="Open in new tab"
          >
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" /> Open
          </a>
          <button
            onClick={() => setConfirmRegenerate(true)}
            disabled={regenerateMutation.isPending}
            className="text-xs inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
            title="Regenerate token (breaks existing links)"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" /> Regenerate
          </button>
        </div>
      </div>

      {confirmRegenerate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmRegenerate(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-brand-navy">Regenerate application token?</h3>
            <p className="text-sm text-gray-700">
              The current link will stop working immediately. Anyone who has it bookmarked or saw
              it in a LinkedIn post will see "no longer accepting applications". You'll get a new
              URL to share.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmRegenerate(false)}
                className="flex-1 btn-secondary text-sm"
                disabled={regenerateMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
