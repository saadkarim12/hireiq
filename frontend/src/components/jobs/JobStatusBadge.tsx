'use client'
// src/components/jobs/JobStatusBadge.tsx
import type { JobStatus } from '@/types'
import { JOB_STATUS, JOB_STATUS_META } from '@/lib/constants'
import clsx from 'clsx'

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = JOB_STATUS_META[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', config.badgeClasses)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', config.dotClasses, status === JOB_STATUS.ACTIVE && 'animate-pulse')} />
      {config.label}
    </span>
  )
}
