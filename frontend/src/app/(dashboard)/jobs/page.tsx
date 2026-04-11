'use client'
// src/app/(dashboard)/jobs/page.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { jobsApi } from '@/api/jobs'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { PlusIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import type { JobStatus } from '@/types'
import clsx from 'clsx'

const STATUS_TABS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All Jobs', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Draft', value: 'draft' },
  { label: 'Paused', value: 'paused' },
  { label: 'Closed', value: 'closed' },
]

export default function JobsPage() {
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', { status: statusFilter }],
    queryFn: () => jobsApi.list({ status: statusFilter === 'all' ? undefined : statusFilter }),
  })

  const jobs = (data?.data || []).filter(j =>
    search
      ? j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.hiringCompany.toLowerCase().includes(search.toLowerCase())
      : true
  )

  return (
    <>
      <TopBar title="Jobs" subtitle="Manage all your open roles" />
      <div className="p-6 space-y-5">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Search */}
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
          {STATUS_TABS.map((tab) => (
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
              <Link
                key={job.id}
                href={`/jobs/${job.id}/pipeline`}
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
                  <JobStatusBadge status={job.status} />
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
            ))}
          </div>
        )}
      </div>
    </>
  )
}
