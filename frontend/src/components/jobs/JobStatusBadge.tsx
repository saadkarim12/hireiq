'use client'
// src/components/jobs/JobStatusBadge.tsx
import type { JobStatus } from '@/types'
import clsx from 'clsx'

const statusConfig: Record<JobStatus, { label: string; classes: string; dot: string }> = {
  draft:  { label: 'Draft',  classes: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' },
  active: { label: 'Active', classes: 'bg-green-50 text-green-700',  dot: 'bg-green-500' },
  paused: { label: 'Paused', classes: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-500' },
  closed: { label: 'Closed', classes: 'bg-red-50 text-red-600',     dot: 'bg-red-400' },
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = statusConfig[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', config.classes)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', config.dot, status === 'active' && 'animate-pulse')} />
      {config.label}
    </span>
  )
}
