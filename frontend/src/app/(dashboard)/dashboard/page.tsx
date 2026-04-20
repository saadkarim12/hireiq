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

function KpiCard({ icon, value, label, sub, color, bg, onClick }: any) {
  return (
    <button onClick={onClick}
      className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md transition-all w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: bg }}>
          {icon}
        </div>
        <span className="text-3xl font-bold" style={{ color }}>{value}</span>
      </div>
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </button>
  )
}

const STAGE_LABELS: Record<string, string> = {
  applied: 'applied', evaluated: 'accepted to Talent Pool',
  screening: 'invited to WhatsApp screening', shortlisted: 'shortlisted',
  interviewing: 'moved to interview', offered: 'offered', hired: 'hired',
  rejected: 'rejected',
}

const STAGE_COLORS: Record<string, string> = {
  evaluated: '#0A3D2E', screening: '#1D4ED8', shortlisted: '#C9A84C',
  interviewing: '#7C3AED', offered: '#0F6E56', hired: '#166534', rejected: '#991B1B',
}

export default function DashboardPage() {
  const router = useRouter()
  const [period, setPeriod] = useState(30)

  // Structured queryKeys so any mutation can invalidate the whole dashboard
  // with a single call: queryClient.invalidateQueries({ queryKey: ['dashboard'] }).
  const { data: jobsRes } = useQuery({
    queryKey: ['dashboard', 'jobs'],
    queryFn: () => api.get<any[]>('/jobs'),
    refetchInterval: 60000,
  })

  const { data: candidatesRes } = useQuery({
    queryKey: ['dashboard', 'candidates', period],
    queryFn: () => api.get<any[]>(`/talent-pool/search?maxDays=${period}`),
    refetchInterval: 60000,
  })

  const { data: recentRes } = useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => api.get<any[]>('/talent-pool/search?maxDays=7'),
    refetchInterval: 30000,
  })

  const { data: poolRes } = useQuery({
    queryKey: ['dashboard', 'pool'],
    queryFn: () => api.get<any[]>('/talent-pool/search?maxDays=365'),
  })

  const jobs: any[] = jobsRes?.data?.data || []
  const candidates: any[] = candidatesRes?.data?.data || []
  const recent: any[] = recentRes?.data?.data || []
  const pool: any[] = poolRes?.data?.data || []

  const cvsProcessed = candidates.filter((c: any) => c.fullName && c.fullName !== '<UNKNOWN>' && c.fullName !== 'UNKNOWN')

  // Phase 6k semantics:
  //   Applied / Evaluated with AI recommendation  → "Awaiting Review" (recruiter needs to Approve to L1)
  //   shortlisted + conversationState=screening_q* → "In Screening" (WhatsApp sim running)
  //   shortlisted (otherwise)                     → "Shortlisted" (L1 done, awaiting Approve to L2)
  //   interviewing                                → "Interviewing" (L2, awaiting Approve to L3)
  const awaitingReview = candidates.filter((c: any) =>
    ['applied', 'evaluated'].includes(c.pipelineStage) && c.aiRecommendation != null
  )
  const inScreening = candidates.filter((c: any) =>
    c.pipelineStage === 'shortlisted' &&
    typeof c.conversationState === 'string' &&
    c.conversationState.startsWith('screening_q')
  )
  const shortlisted = candidates.filter((c: any) => c.pipelineStage === 'shortlisted')
  const interviewing = candidates.filter((c: any) => c.pipelineStage === 'interviewing')
  const poolSize = pool.filter((c: any) => c.fullName && c.fullName !== '<UNKNOWN>' && c.pipelineStage !== 'rejected')

  const conversionRate = cvsProcessed.length > 0
    ? Math.round((shortlisted.length / cvsProcessed.length) * 100) : 0

  // WhatsApp response rate: of those who were invited to WhatsApp (L1+), what % finished screening?
  const invitedToWa = candidates.filter((c: any) =>
    ['shortlisted', 'interviewing', 'offered', 'hired'].includes(c.pipelineStage)
  )
  const stillScreening = invitedToWa.filter((c: any) =>
    typeof c.conversationState === 'string' && c.conversationState.startsWith('screening_q')
  )
  const whatsappResponseRate = invitedToWa.length > 0
    ? Math.round(((invitedToWa.length - stillScreening.length) / invitedToWa.length) * 100) : null

  // Recent activity — last 10 candidates sorted by updatedAt
  const activity = [...recent]
    .filter((c: any) => c.fullName && c.fullName !== '<UNKNOWN>' && c.fullName !== 'UNKNOWN')
    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 10)

  // Row 1 — Action items (what needs recruiter attention right now)
  const actionKpis = [
    { icon: '👀', value: awaitingReview.length, label: 'Awaiting Review', sub: 'AI scored — needs Approve to L1', color: '#B45309', bg: '#FEF3C7', onClick: () => router.push('/jobs') },
    { icon: '💬', value: inScreening.length,    label: 'In Screening',    sub: 'WhatsApp sim in progress',         color: '#1D4ED8', bg: '#EFF6FF', onClick: () => router.push('/jobs') },
    { icon: '⭐', value: shortlisted.length,    label: 'Shortlisted',     sub: 'L1 complete — ready for L2',        color: '#C9A84C', bg: '#FEF3C7', onClick: () => router.push('/jobs') },
    { icon: '🎙', value: interviewing.length,   label: 'Interviewing',    sub: 'L2 complete — ready for L3',        color: '#7C3AED', bg: '#F5F3FF', onClick: () => router.push('/jobs') },
  ]
  // Row 2 — Performance metrics (outcomes + throughput)
  const metricKpis = [
    { icon: '📄', value: cvsProcessed.length,        label: 'CVs Processed',         sub: 'AI parsed in period',      color: '#92400E', bg: '#FEF3C7', onClick: () => router.push('/cv-inbox') },
    { icon: '📊', value: `${conversionRate}%`,       label: 'Conversion Rate',       sub: 'CVs → Shortlisted',         color: '#7C3AED', bg: '#F5F3FF', onClick: () => {} },
    { icon: '📞', value: whatsappResponseRate == null ? '—' : `${whatsappResponseRate}%`, label: 'WhatsApp Response Rate', sub: 'L1+ who finished screening', color: '#0F6E56', bg: '#E1F5EE', onClick: () => {} },
    { icon: '👥', value: poolSize.length,            label: 'Talent Pool Size',      sub: 'Total active candidates',   color: '#0A3D2E', bg: '#E8F5EE', onClick: () => router.push('/talent-pool') },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Salt Recruitment — performance overview</p>
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

      {/* KPI Grid — Row 1: action items, Row 2: performance metrics */}
      <div className="space-y-4 mb-8">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Action Items</p>
          <div className="grid grid-cols-4 gap-4">
            {actionKpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Performance</p>
          <div className="grid grid-cols-4 gap-4">
            {metricKpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Recent Activity</h2>
          <p className="text-xs text-gray-400 mt-0.5">Last 7 days — latest candidate movements</p>
        </div>

        {activity.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-sm font-medium">No recent activity</p>
            <p className="text-xs mt-1">Upload CVs or invite candidates to see activity here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activity.map((c: any, i: number) => {
              const stage = c.pipelineStage || 'applied'
              const color = STAGE_COLORS[stage] || '#6B7280'
              const label = STAGE_LABELS[stage] || stage
              const timeAgo = (() => {
                const diff = Date.now() - new Date(c.updatedAt || c.createdAt).getTime()
                const hours = Math.floor(diff / 3600000)
                const days = Math.floor(diff / 86400000)
                if (hours < 1) return 'just now'
                if (hours < 24) return `${hours}h ago`
                return `${days}d ago`
              })()

              return (
                <div key={c.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                    {c.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{c.fullName}</span>
                    <span className="text-sm text-gray-500"> — {c.currentRole || 'Candidate'}</span>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                    style={{ background: color + '15', color }}>
                    {label}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0 w-16 text-right">{timeAgo}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Roadmap */}
      <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-5">
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
