'use client'
// src/app/(dashboard)/analytics/page.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import { KpiCard } from '@/components/dashboard/KpiCard'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import { format, subDays } from 'date-fns'
import {
  ClockIcon, UsersIcon, ChartBarIcon, CalendarIcon, ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const COLORS = ['#1A4A8A', '#C9A84C', '#166534', '#6B21A8', '#C2410C']

const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export default function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30)
  const [isExporting, setIsExporting] = useState(false)

  const from = format(subDays(new Date(), rangeDays), 'yyyy-MM-dd')
  const to = format(new Date(), 'yyyy-MM-dd')

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics-overview', from, to],
    queryFn: () => analyticsApi.getOverview({ from, to }),
  })

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['analytics-timeline', from, to],
    queryFn: () => analyticsApi.getApplicationsTimeline({ from, to }),
  })

  const { data: scoreDistribution } = useQuery({
    queryKey: ['score-distribution'],
    queryFn: () => analyticsApi.getScoreDistribution(),
  })

  const { data: jobsAnalytics, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs-analytics'],
    queryFn: () => analyticsApi.getJobsAnalytics({ status: 'active' }),
  })

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const url = await analyticsApi.exportCsv({ from, to })
      window.open(url, '_blank')
      toast.success('CSV export ready for download')
    } catch {
      toast.error('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      
      <div className="p-6 space-y-6">

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {DATE_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setRangeDays(r.days)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  rangeDays === r.days
                    ? 'bg-brand-navy text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn-secondary text-sm gap-2"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Avg Time to Shortlist"
            value={overview ? Math.round(overview.avgTimeToShortlistHours) : 0}
            subtitle="hours from posting"
            icon={<ClockIcon className="w-5 h-5" />}
            color="blue"
            isLoading={overviewLoading}
          />
          <KpiCard
            title="Total Screened"
            value={overview?.totalScreened ?? 0}
            subtitle="candidates processed by AI"
            icon={<UsersIcon className="w-5 h-5" />}
            color="gold"
            isLoading={overviewLoading}
          />
          <KpiCard
            title="Shortlist Rate"
            value={overview ? Math.round((overview.totalShortlisted / Math.max(overview.totalScreened, 1)) * 100) : 0}
            subtitle="% of screened shortlisted"
            icon={<ChartBarIcon className="w-5 h-5" />}
            color="green"
            isLoading={overviewLoading}
          />
          <KpiCard
            title="No-Show Rate"
            value={overview ? Math.round(overview.interviewNoShowRate * 100) : 0}
            subtitle="% of confirmed interviews"
            icon={<CalendarIcon className="w-5 h-5" />}
            color={overview && overview.interviewNoShowRate > 0.15 ? 'red' : 'purple'}
            isLoading={overviewLoading}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Applications Timeline */}
          <div className="xl:col-span-2 card rounded-xl p-5">
            <h3 className="text-sm font-bold text-brand-navy mb-4">Applications Over Time</h3>
            {timelineLoading ? (
              <div className="skeleton h-48 rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickFormatter={(v) => format(new Date(v), 'MMM d')}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                  />
                  <Legend iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="applications" stroke="#1A4A8A" strokeWidth={2} dot={false} name="Applied" />
                  <Line type="monotone" dataKey="screened" stroke="#C9A84C" strokeWidth={2} dot={false} name="Screened" />
                  <Line type="monotone" dataKey="shortlisted" stroke="#166534" strokeWidth={2} dot={false} name="Shortlisted" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Source Channels */}
          <div className="card rounded-xl p-5">
            <h3 className="text-sm font-bold text-brand-navy mb-4">Application Sources</h3>
            {overviewLoading ? (
              <div className="skeleton h-48 rounded-lg" />
            ) : overview?.topSourceChannels && overview.topSourceChannels.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={overview.topSourceChannels}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      dataKey="count"
                      nameKey="channel"
                    >
                      {overview.topSourceChannels.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`${v} (${overview.topSourceChannels.find(c => c.channel === name)?.percentage.toFixed(0)}%)`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-3">
                  {overview.topSourceChannels.map((ch, i) => (
                    <div key={ch.channel} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-gray-600 capitalize">{ch.channel.replace('_', ' ')}</span>
                      </div>
                      <span className="font-semibold text-gray-700">{ch.percentage.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No source data yet</p>
            )}
          </div>
        </div>

        {/* Score Distribution */}
        {scoreDistribution && scoreDistribution.length > 0 && (
          <div className="card rounded-xl p-5">
            <h3 className="text-sm font-bold text-brand-navy mb-4">AI Score Distribution</h3>
            <p className="text-xs text-gray-400 mb-4">Distribution of composite scores across all screened candidates — shows AI discrimination quality</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoreDistribution} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                <Bar dataKey="count" name="Candidates" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((entry, i) => {
                    const range = parseInt(entry.range.split('-')[0])
                    return <Cell key={i} fill={range >= 80 ? '#166534' : range >= 60 ? '#C9A84C' : '#DC2626'} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Per-Job Table */}
        <div className="card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-brand-navy">Per-Job Performance</h3>
          </div>
          {jobsLoading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Job Title', 'Days Open', 'Applications', 'Screened %', 'Shortlisted %', 'Avg Score', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(jobsAnalytics || []).map((job) => (
                    <tr key={job.jobId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-semibold text-brand-navy">{job.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{job.daysOpen}d</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{job.applications}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-semibold ${job.screenedPercent >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
                          {job.screenedPercent.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-semibold ${job.shortlistedPercent >= 15 ? 'text-green-600' : 'text-gray-500'}`}>
                          {job.shortlistedPercent.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-bold ${job.avgScore >= 70 ? 'text-green-700' : 'text-amber-600'}`}>
                          {job.avgScore.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          job.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        } capitalize`}>
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!jobsAnalytics || jobsAnalytics.length === 0) && (
                <div className="py-12 text-center text-gray-400 text-sm">No job data available yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
