'use client'
// src/app/(dashboard)/dashboard/page.tsx
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import { jobsApi } from '@/api/jobs'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { JobsTable } from '@/components/dashboard/JobsTable'
import { LockedFeaturesGrid } from '@/components/dashboard/LockedFeaturesGrid'
import {
  BriefcaseIcon,
  InboxIcon,
  SparklesIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'

export default function DashboardPage() {
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: analyticsApi.getDashboardKpis,
    refetchInterval: 60_000, // refresh every minute
  })

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', { status: 'active' }],
    queryFn: () => jobsApi.list({ status: 'active' }),
  })

  const jobs = jobsData?.data || []

  return (
    <>
            <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Active Jobs"
            value={kpis?.activeJobs ?? 0}
            subtitle="Total open roles"
            icon={<BriefcaseIcon className="w-5 h-5" />}
            color="blue"
            isLoading={kpisLoading}
          />
          <KpiCard
            title="New Applications"
            value={kpis?.newApplications ?? 0}
            subtitle="Since last login"
            icon={<InboxIcon className="w-5 h-5" />}
            color="gold"
            isLoading={kpisLoading}
            highlight={kpis?.newApplications ? kpis.newApplications > 0 : false}
          />
          <KpiCard
            title="Shortlists Ready"
            value={kpis?.shortlistsReady ?? 0}
            subtitle="Awaiting your review"
            icon={<SparklesIcon className="w-5 h-5" />}
            color="green"
            isLoading={kpisLoading}
            highlight={kpis?.shortlistsReady ? kpis.shortlistsReady > 0 : false}
          />
          <KpiCard
            title="Interviews Today"
            value={kpis?.interviewsToday ?? 0}
            subtitle="Scheduled & confirmed"
            icon={<CalendarIcon className="w-5 h-5" />}
            color="purple"
            isLoading={kpisLoading}
          />
        </div>

        {/* Shortlist Ready Banner */}
        {kpis && kpis.shortlistsReady > 0 && (
          <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SparklesIcon className="w-5 h-5 text-brand-gold flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-brand-navy">
                  {kpis.shortlistsReady} {kpis.shortlistsReady === 1 ? 'role has' : 'roles have'} AI shortlists ready for review
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Candidates have been scored and ranked — your review takes about 20 minutes per role
                </p>
              </div>
            </div>
            <a
              href="/jobs?filter=shortlist_ready"
              className="btn-gold text-xs px-3 py-1.5 flex-shrink-0"
            >
              Review Now
            </a>
          </div>
        )}

        {/* Active Jobs Table */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-brand-navy">Active Jobs</h2>
              <p className="text-xs text-gray-500 mt-0.5">{jobs.length} open role{jobs.length !== 1 ? 's' : ''}</p>
            </div>
            <a href="/jobs/new" className="btn-primary text-xs px-3 py-1.5">
              + Post New Job
            </a>
          </div>
          <JobsTable jobs={jobs} isLoading={jobsLoading} />
        </div>

        {/* Coming Soon Features */}
        <LockedFeaturesGrid />
      </div>
    </>
  )
}
