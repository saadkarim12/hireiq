'use client'
// src/app/(dashboard)/jobs/page.tsx
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { jobsApi } from '@/api/jobs'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { PlusIcon, MagnifyingGlassIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import type { Job, JobStatus } from '@/types'
import {
  JOB_STATUS,
  JOB_STATUS_TABS,
  DEFAULT_JOB_STATUS_TAB,
  JOB_ACTIONS,
  JOB_ACTIONS_BY_STATUS,
} from '@/lib/constants'
import clsx from 'clsx'

type ActionKey = keyof typeof JOB_ACTIONS

export default function JobsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<JobStatus>(DEFAULT_JOB_STATUS_TAB)
  const [search, setSearch] = useState('')
  const [openMenuJobId, setOpenMenuJobId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ job: Job; key: ActionKey } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', { status: statusFilter }],
    queryFn: () => jobsApi.list({ status: statusFilter }),
  })

  const jobs = (data?.data || []).filter(j =>
    search
      ? j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.hiringCompany.toLowerCase().includes(search.toLowerCase())
      : true
  )

  // ── Lifecycle mutations ────────────────────────────────────────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jobs'] })

  const archiveMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.updateStatus(jobId, 'archived'),
    onSuccess:  () => { invalidate(); toast.success('Job archived') },
    onError:    () => toast.error('Failed to archive job'),
  })
  const unarchiveMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.unarchive(jobId),
    onSuccess:  () => { invalidate(); toast.success('Job restored to active') },
    onError:    () => toast.error('Failed to unarchive job'),
  })
  const publishMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.activate(jobId),
    onSuccess:  (data) => { invalidate(); toast.success('Draft published'); router.push(`/jobs/${data.id}/pipeline`) },
    onError:    () => toast.error('Failed to publish draft'),
  })
  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.remove(jobId),
    onSuccess:  () => { invalidate(); toast.success('Draft deleted') },
    onError:    () => toast.error('Failed to delete draft'),
  })

  const isMutating =
    archiveMutation.isPending ||
    unarchiveMutation.isPending ||
    publishMutation.isPending ||
    deleteMutation.isPending

  // ── Action dispatch ────────────────────────────────────────────────────────
  const onActionClick = (job: Job, key: ActionKey) => {
    setOpenMenuJobId(null)
    if (key === 'VIEW')   { router.push(`/jobs/${job.id}/view`); return }
    if (key === 'EDIT' || key === 'RESUME') { router.push(`/jobs/${job.id}/edit`); return }
    // Confirm-required actions
    setPendingAction({ job, key })
  }

  const confirmPendingAction = () => {
    if (!pendingAction) return
    const { job, key } = pendingAction
    switch (key) {
      case 'ARCHIVE':   archiveMutation.mutate(job.id);   break
      case 'UNARCHIVE': unarchiveMutation.mutate(job.id); break
      case 'PUBLISH':   publishMutation.mutate(job.id);   break
      case 'DELETE':    deleteMutation.mutate(job.id);    break
    }
    setPendingAction(null)
  }

  return (
    <>
      <div className="p-6 space-y-5">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs..."
                className="input pl-9 w-60 text-sm"
              />
            </div>
          </div>
          <Link href="/jobs/new" className="btn-primary gap-2">
            <PlusIcon className="w-4 h-4" />
            Post New Job
          </Link>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200">
          {JOB_STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                statusFilter === tab.value
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Jobs Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="card p-5 space-y-3">
                <div className="skeleton h-5 w-48 rounded" />
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-4 w-40 rounded" />
                <div className="flex gap-2 pt-2">
                  <div className="skeleton h-6 w-16 rounded-full" />
                  <div className="skeleton h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="card py-16 text-center">
            <div className="text-4xl mb-3">💼</div>
            <p className="text-base font-semibold text-gray-700">No jobs found</p>
            <p className="text-sm text-gray-400 mt-1 mb-5">
              {search ? `No results for "${search}"` : 'Post your first job to get started'}
            </p>
            <Link href="/jobs/new" className="btn-primary inline-flex">Post a Job</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                menuOpen={openMenuJobId === job.id}
                onMenuToggle={() => setOpenMenuJobId(openMenuJobId === job.id ? null : job.id)}
                onMenuClose={() => setOpenMenuJobId(null)}
                onAction={(key) => onActionClick(job, key)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {pendingAction && (() => {
        const action = JOB_ACTIONS[pendingAction.key] as { confirm?: { title: string; body: string; confirm: string; cancel: string } }
        if (!action.confirm) return null
        const isDestructive = pendingAction.key === 'DELETE'
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setPendingAction(null)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h3 className="text-base font-bold text-brand-navy">{action.confirm.title}</h3>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{pendingAction.job.title}</span>
                <span className="text-gray-500"> at {pendingAction.job.hiringCompany}</span>
              </p>
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
    </>
  )
}

// ── JobCard ────────────────────────────────────────────────────────────────
// Card body is a Link to the natural destination (pipeline for active jobs,
// view screen for everything else). The kebab menu sits above the link with
// stop-propagation so clicking it opens the action dropdown without firing
// the navigation.
function JobCard({
  job,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onAction,
}: {
  job: Job
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onAction: (key: ActionKey) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const actions = JOB_ACTIONS_BY_STATUS[job.status]

  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) onMenuClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen, onMenuClose])

  const cardHref = job.status === JOB_STATUS.ACTIVE ? `/jobs/${job.id}/pipeline` : `/jobs/${job.id}/view`

  return (
    <div className="relative">
      <Link
        href={cardHref}
        className="card card-hover rounded-xl p-5 flex flex-col gap-3 group"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-brand-navy group-hover:text-brand-blue transition-colors truncate">
              {job.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{job.hiringCompany}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <JobStatusBadge status={job.status} />
            {/* Spacer so the kebab doesn't overlap the badge */}
            <div className="w-6" />
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>📍 {job.locationCity}, {job.locationCountry}</span>
          <span className="capitalize">🏢 {job.jobType}</span>
          <span>💰 {job.currency} {job.salaryMin.toLocaleString()}–{job.salaryMax.toLocaleString()}</span>
        </div>

        {/* Skills */}
        <div className="flex flex-wrap gap-1">
          {job.requiredSkills.slice(0, 3).map((skill) => (
            <span key={skill} className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue text-xs rounded-full font-medium">
              {skill}
            </span>
          ))}
          {job.requiredSkills.length > 3 && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full">
              +{job.requiredSkills.length - 3} more
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100 mt-auto">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500">
              <span className="font-semibold text-gray-700">{job.applicationsCount ?? 0}</span> applied
            </span>
            <span className={clsx(
              'font-semibold',
              (job.shortlistedCount ?? 0) > 0 ? 'text-brand-blue' : 'text-gray-400'
            )}>
              <span>{job.shortlistedCount ?? 0}</span> shortlisted
            </span>
          </div>
          {job.activatedAt && (
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(job.activatedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </Link>

      {/* Kebab menu — absolute over the card, sibling to the Link so it
          doesn't trigger navigation. */}
      <div ref={menuRef} className="absolute top-4 right-4">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMenuToggle() }}
          aria-label="Job actions"
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <EllipsisVerticalIcon className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-30">
            {actions.map((key) => {
              const action = JOB_ACTIONS[key]
              const isDestructive = key === 'DELETE'
              return (
                <button
                  key={key}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAction(key) }}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors',
                    isDestructive ? 'text-red-600 hover:bg-red-50' : 'text-gray-700',
                  )}
                >
                  {action.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
