'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()

  const { data: jobsRes } = useQuery({
    queryKey: ['dashboard-jobs'],
    queryFn: () => api.get<any[]>('/jobs'),
    refetchInterval: 30000,
  })

  const { data: inboxRes } = useQuery({
    queryKey: ['dashboard-inbox'],
    queryFn: () => api.get<any[]>('/talent-pool/search?maxDays=30'),
    refetchInterval: 30000,
  })

  const { data: poolRes } = useQuery({
    queryKey: ['dashboard-pool'],
    queryFn: () => api.get<any[]>('/talent-pool/search?maxDays=90'),
    refetchInterval: 30000,
  })

  const jobs = jobsRes?.data?.data || []
  const activeJobs = jobs.filter((j: any) => j.status === 'active')

  const allCandidates = poolRes?.data?.data || []
  const inboxCandidates = (inboxRes?.data?.data || []).filter((c: any) =>
    c.pipelineStage !== 'rejected' &&
    c.fullName && c.fullName !== '<UNKNOWN>' && c.fullName !== 'UNKNOWN'
  )
  const pendingReview = inboxCandidates.filter((c: any) =>
    ['applied', 'evaluated'].includes(c.pipelineStage)
  )
  const inScreening = allCandidates.filter((c: any) =>
    c.pipelineStage === 'screening'
  )
  const shortlisted = allCandidates.filter((c: any) =>
    c.pipelineStage === 'shortlisted'
  )

  const stats = [
    {
      label: 'Active Jobs',
      value: activeJobs.length,
      sub: `${jobs.length} total posted`,
      icon: '💼',
      color: '#0A3D2E',
      bg: '#E8F5EE',
      onClick: () => router.push('/jobs'),
    },
    {
      label: 'CVs Pending Review',
      value: pendingReview.length,
      sub: 'In CV Inbox — awaiting decision',
      icon: '📬',
      color: '#92400E',
      bg: '#FEF3C7',
      onClick: () => router.push('/cv-inbox'),
    },
    {
      label: 'In WhatsApp Screening',
      value: inScreening.length,
      sub: 'Candidates answering questions',
      icon: '💬',
      color: '#1D4ED8',
      bg: '#EFF6FF',
      onClick: () => router.push('/talent-pool'),
    },
    {
      label: 'Shortlisted',
      value: shortlisted.length,
      sub: 'Ready for interview',
      icon: '⭐',
      color: '#166534',
      bg: '#DCFCE7',
      onClick: () => router.push('/talent-pool'),
    },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Live overview of your recruitment pipeline</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s, i) => (
          <button key={i} onClick={s.onClick}
            className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{s.icon}</span>
              <span className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
            <p className="text-sm font-semibold text-gray-800">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </button>
        ))}
      </div>

      {/* Active Jobs pipeline summary */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Active Jobs</h2>
          <button onClick={() => router.push('/jobs/new')}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
            style={{ background: '#0A3D2E' }}>
            + Post New Job
          </button>
        </div>
        {activeJobs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">💼</div>
            <p className="font-medium text-sm">No active jobs yet</p>
            <button onClick={() => router.push('/jobs/new')}
              className="mt-3 px-4 py-2 text-sm font-semibold text-white rounded-xl"
              style={{ background: '#0A3D2E' }}>
              Post your first job
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0A3D2E' }}>
                {['Job', 'Company', 'Location', 'Applied', 'Shortlisted', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#C9A84C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeJobs.map((j: any, i: number) => (
                <tr key={j.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800">{j.title}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{j.hiringCompany}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{j.locationCity || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold" style={{ color: '#0A3D2E' }}>
                      {allCandidates.filter((c: any) => c.jobId === j.id && ['applied','evaluated','screening'].includes(c.pipelineStage)).length}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>
                      {allCandidates.filter((c: any) => c.jobId === j.id && c.pipelineStage === 'shortlisted').length}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => router.push(`/jobs/${j.id}/pipeline`)}
                        className="text-xs px-3 py-1 rounded-lg font-medium text-white"
                        style={{ background: '#0A3D2E' }}>
                        Pipeline
                      </button>
                      <button onClick={() => router.push(`/jobs/${j.id}/talent-matches`)}
                        className="text-xs px-3 py-1 rounded-lg font-medium border"
                        style={{ borderColor: '#0A3D2E', color: '#0A3D2E' }}>
                        Matches
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Platform Roadmap */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">Coming Soon</h2>
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
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>{f.eta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
