'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRouter } from 'next/navigation'

const PERIODS = [
  { label: 'This Month', value: 30 },
  { label: 'Quarter', value: 90 },
  { label: '6 Months', value: 180 },
  { label: 'Year', value: 365 },
]

export default function DashboardPage() {
  const router = useRouter()
  const [period, setPeriod] = useState(30)

  const { data: jobsRes } = useQuery({
    queryKey: ['dashboard-jobs'],
    queryFn: () => api.get<any[]>('/jobs'),
    refetchInterval: 60000,
  })

  const { data: candidatesRes } = useQuery({
    queryKey: ['dashboard-candidates', period],
    queryFn: () => api.get<any[]>(`/talent-pool/search?maxDays=${period}`),
    refetchInterval: 60000,
  })

  const { data: poolRes } = useQuery({
    queryKey: ['dashboard-pool'],
    queryFn: () => api.get<any[]>('/talent-pool/search?maxDays=365'),
    refetchInterval: 60000,
  })

  const jobs: any[] = jobsRes?.data?.data || []
  const candidates: any[] = candidatesRes?.data?.data || []
  const allPool: any[] = poolRes?.data?.data || []

  // Period cutoff
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - period)

  const activeJobs = jobs.filter((j: any) => j.status === 'active')
  const closedJobs = jobs.filter((j: any) =>
    j.status === 'closed' && new Date(j.updatedAt) >= cutoff
  )
  const cvsProcessed = candidates.filter((c: any) =>
    c.fullName && c.fullName !== '<UNKNOWN>'
  )
  const shortlisted = candidates.filter((c: any) => c.pipelineStage === 'shortlisted')
  const inScreening = candidates.filter((c: any) => c.pipelineStage === 'screening')
  const poolSize = allPool.filter((c: any) =>
    c.fullName && c.fullName !== '<UNKNOWN>' && c.pipelineStage !== 'rejected'
  )

  // Avg days to shortlist (mock — will be real in Phase 7)
  const avgDays = shortlisted.length > 0
    ? Math.round(shortlisted.reduce((acc: number, c: any) => {
        const days = Math.floor((new Date().getTime() - new Date(c.createdAt).getTime()) / 86400000)
        return acc + days
      }, 0) / shortlisted.length)
    : 0

  const conversionRate = cvsProcessed.length > 0
    ? Math.round((shortlisted.length / cvsProcessed.length) * 100)
    : 0

  const kpis = [
    { label: 'Active Jobs', value: activeJobs.length, sub: 'Open roles', icon: '💼', color: '#0A3D2E', bg: '#E8F5EE', onClick: () => router.push('/jobs') },
    { label: 'Jobs Closed', value: closedJobs.length, sub: 'In selected period', icon: '✅', color: '#166534', bg: '#DCFCE7', onClick: () => router.push('/jobs') },
    { label: 'CVs Processed', value: cvsProcessed.length, sub: 'Parsed by AI', icon: '📄', color: '#92400E', bg: '#FEF3C7', onClick: () => router.push('/cv-inbox') },
    { label: 'In Screening', value: inScreening.length, sub: 'WhatsApp in progress', icon: '💬', color: '#1D4ED8', bg: '#EFF6FF', onClick: () => router.push('/talent-pool') },
    { label: 'Shortlisted', value: shortlisted.length, sub: 'Passed all stages', icon: '⭐', color: '#0A3D2E', bg: '#E8F5EE', onClick: () => router.push('/talent-pool') },
    { label: 'Conversion Rate', value: `${conversionRate}%`, sub: 'CVs → Shortlisted', icon: '📊', color: '#7C3AED', bg: '#F5F3FF', onClick: () => {} },
    { label: 'Avg Days to Shortlist', value: avgDays || '—', sub: 'From CV upload', icon: '⏱', color: '#C2410C', bg: '#FFF7ED', onClick: () => {} },
    { label: 'Talent Pool Size', value: poolSize.length, sub: 'Total candidates', icon: '👥', color: '#0F6E56', bg: '#E1F5EE', onClick: () => router.push('/talent-pool') },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header with period filter */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Salt Recruitment — recruitment performance overview</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl border border-gray-200 bg-white">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={period === p.value
                ? { background: '#0A3D2E', color: '#C9A84C' }
                : { color: '#6B7280' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map((k, i) => (
          <button key={i} onClick={k.onClick}
            className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                style={{ background: k.bg }}>
                {k.icon}
              </div>
              <span className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</span>
            </div>
            <p className="text-sm font-semibold text-gray-800">{k.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </button>
        ))}
      </div>

      {/* Active Jobs table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Active Jobs</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click Pipeline to manage candidates · Click Matches to find pool candidates</p>
          </div>
          <button onClick={() => router.push('/jobs/new')}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
            style={{ background: '#0A3D2E' }}>
            + Post New Job
          </button>
        </div>

        {activeJobs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">💼</div>
            <p className="font-medium text-sm">No active jobs</p>
            <button onClick={() => router.push('/jobs/new')}
              className="mt-3 px-4 py-2 text-sm font-semibold text-white rounded-xl"
              style={{ background: '#0A3D2E' }}>
              Post first job
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0A3D2E' }}>
                {['Job', 'Company', 'Location', 'L1 Applied', 'L2 Screened', 'L3 Interview', 'Shortlisted', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#C9A84C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeJobs.map((j: any, i: number) => {
                const jobCandidates = allPool.filter((c: any) => c.jobId === j.id)
                const l1 = jobCandidates.filter((c: any) => ['applied','evaluated','screening','shortlisted','interviewing','offered','hired'].includes(c.pipelineStage)).length
                const l2 = jobCandidates.filter((c: any) => ['shortlisted','interviewing','offered','hired'].includes(c.pipelineStage)).length
                const l3 = jobCandidates.filter((c: any) => ['interviewing','offered','hired'].includes(c.pipelineStage)).length
                const sl = jobCandidates.filter((c: any) => ['offered','hired'].includes(c.pipelineStage)).length

                return (
                  <tr key={j.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">{j.title}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{j.hiringCompany}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{j.locationCity || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: '#374151' }}>{l1}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: '#1D4ED8' }}>{l2}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: '#7C3AED' }}>{l3}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: '#0A3D2E' }}>{sl}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => router.push(`/jobs/${j.id}/pipeline`)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium text-white"
                          style={{ background: '#0A3D2E' }}>
                          Pipeline
                        </button>
                        <button onClick={() => router.push(`/jobs/${j.id}/talent-matches`)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium border"
                          style={{ borderColor: '#C9A84C', color: '#92400E' }}>
                          Matches
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Coming soon */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase mb-4">Platform Roadmap</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: '📞', title: 'AI Reference Check Agent', desc: 'Automated WhatsApp reference conversations', eta: 'Q3 2026' },
            { icon: '🎥', title: 'AI Video Interview Agent', desc: 'Structured video interviews with scoring', eta: 'Q3 2026' },
            { icon: '🇸🇦', title: 'Saudization Dashboard', desc: 'Real-time Nitaqat compliance tracking', eta: 'Q4 2026' },
          ].map((f, i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-100 bg-gray-50">
              <div className="text-2xl mb-2">{f.icon}</div>
              <p className="text-sm font-medium text-gray-700">{f.title}</p>
              <p className="text-xs text-gray-400 mt-1">{f.desc}</p>
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#E8F5EE', color: '#0A3D2E' }}>{f.eta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
