'use client'
// src/components/dashboard/JobsTable.tsx
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { Job } from '@/types'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { ArrowRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface JobsTableProps {
  jobs: Job[]
  isLoading?: boolean
}

export function JobsTable({ jobs, isLoading }: JobsTableProps) {
  if (isLoading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="skeleton h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-48 rounded" />
              <div className="skeleton h-3 w-32 rounded" />
            </div>
            <div className="skeleton h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">💼</span>
        </div>
        <p className="text-sm font-semibold text-gray-700">No active jobs yet</p>
        <p className="text-xs text-gray-400 mt-1 mb-4">Post your first job to start screening candidates</p>
        <Link href="/jobs/new" className="btn-primary text-xs">
          Post a Job
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {['Role', 'Company', 'Location', 'Applied', 'Shortlisted', 'Status', 'Days Open', ''].map((h) => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {jobs.map((job) => {
            const daysOpen = job.activatedAt
              ? Math.floor((Date.now() - new Date(job.activatedAt).getTime()) / (1000 * 60 * 60 * 24))
              : 0
            const isStale = daysOpen > 14 && (job.applicationsCount || 0) === 0

            return (
              <tr
                key={job.id}
                className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                onClick={() => window.location.href = `/jobs/${job.id}/pipeline`}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    {isStale && (
                      <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" title="No activity for 14+ days" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-brand-navy group-hover:text-brand-blue transition-colors">
                        {job.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{job.jobType}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-sm text-gray-700">{job.hiringCompany}</p>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-sm text-gray-500">{job.locationCity}, {job.locationCountry}</p>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="text-sm font-semibold text-gray-700 tabular-nums">
                    {job.applicationsCount ?? 0}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className={clsx(
                    'text-sm font-semibold tabular-nums',
                    (job.shortlistedCount ?? 0) > 0 ? 'text-brand-blue' : 'text-gray-400'
                  )}>
                    {job.shortlistedCount ?? 0}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <JobStatusBadge status={job.status} />
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className={clsx(
                    'text-sm tabular-nums',
                    daysOpen > 30 ? 'text-red-500 font-semibold' : daysOpen > 14 ? 'text-amber-500' : 'text-gray-500'
                  )}>
                    {daysOpen}d
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <ArrowRightIcon className="w-4 h-4 text-gray-300 group-hover:text-brand-blue transition-colors" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
