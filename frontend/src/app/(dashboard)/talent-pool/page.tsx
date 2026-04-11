'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRouter } from 'next/navigation'

const SOURCE_COLORS: Record<string,string> = {
  linkedin:'#0077B5', bayt:'#E8400C', naukri_gulf:'#4A90D9',
  agency_referral:'#0A3D2E', email:'#6B7280', walk_in:'#7C3AED',
  talent_pool_match:'#C9A84C', bulk_upload:'#374151', other:'#9CA3AF', hireiq_apply:'#0F6E56',
}

function ScoreBadge({ score }: { score: number | null }) {
  if (!score) return <span className="text-xs text-gray-400">—</span>
  const color = score >= 75 ? '#166534' : score >= 55 ? '#92400E' : '#991B1B'
  const bg    = score >= 75 ? '#DCFCE7' : score >= 55 ? '#FEF3C7' : '#FEE2E2'
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>{score}</span>
}

export default function TalentPoolPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterScore, setFilterScore] = useState('')

  const { data: poolRes, isLoading } = useQuery({
    queryKey: ['talent-pool', search, filterSource, filterScore],
    queryFn: () => api.get<any[]>(`/talent-pool/search?q=${search}&source=${filterSource}&minScore=${filterScore}&maxDays=90`),
  })

  // Only show accepted (evaluated/shortlisted) candidates — not raw inbox
  const all = poolRes?.data?.data || []
  const candidates = all.filter((c: any) =>
    !['rejected','applied'].includes(c.pipelineStage)
  )

  const sourceBreakdown = candidates.reduce((acc: any, c: any) => {
    const s = c.sourceChannel || 'other'; acc[s] = (acc[s] || 0) + 1; return acc
  }, {})

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Talent Pool</h1>
          <p className="text-gray-500 text-sm mt-1">
            {candidates.length} accepted candidates — ready to match against your open jobs
          </p>
        </div>
        <button onClick={() => router.push('/cv-inbox')}
          className="px-5 py-2.5 text-sm font-semibold rounded-xl border-2 transition-all"
          style={{ borderColor: '#0A3D2E', color: '#0A3D2E' }}>
          + Upload CVs → CV Inbox
        </button>
      </div>

      {/* Source breakdown */}
      {Object.keys(sourceBreakdown).length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Object.entries(sourceBreakdown).map(([source, count]: any) => (
            <div key={source} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SOURCE_COLORS[source] || '#9CA3AF' }} />
              <div>
                <div className="text-xs text-gray-500 capitalize">{source.replace(/_/g,' ')}</div>
                <div className="text-lg font-bold" style={{ color: '#0A3D2E' }}>{count}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or role..."
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400" />
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none">
          <option value="">All sources</option>
          <option value="linkedin">💼 LinkedIn</option>
          <option value="bayt">🌐 Bayt.com</option>
          <option value="naukri_gulf">🔍 Naukri Gulf</option>
          <option value="agency_referral">🤝 Referral</option>
          <option value="hireiq_apply">✅ Applied via HireIQ</option>
        </select>
        <select value={filterScore} onChange={e => setFilterScore(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none">
          <option value="">All scores</option>
          <option value="75">High match (75+)</option>
          <option value="55">Good match (55+)</option>
          <option value="40">Any scored (40+)</option>
        </select>
      </div>

      {/* Candidates table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="font-medium">No candidates in the pool yet</p>
            <p className="text-sm mt-1">Upload CVs via CV Inbox — accepted candidates appear here</p>
            <button onClick={() => router.push('/cv-inbox')}
              className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl"
              style={{ background: '#0A3D2E' }}>
              Go to CV Inbox →
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0A3D2E' }}>
                {['Name','Current Role','Experience','Score','Source','Added','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#C9A84C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c: any, i: number) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                        {c.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '??'}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{c.fullName || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.currentRole || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.yearsExperience ? `${c.yearsExperience} yrs` : '—'}</td>
                  <td className="px-4 py-3"><ScoreBadge score={c.compositeScore} /></td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white capitalize"
                      style={{ background: SOURCE_COLORS[c.sourceChannel] || '#9CA3AF' }}>
                      {(c.sourceChannel || 'other').replace(/_/g,' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                      c.pipelineStage === 'shortlisted' ? 'bg-green-100 text-green-700' :
                      c.pipelineStage === 'screening'   ? 'bg-blue-100 text-blue-700' :
                      'bg-emerald-100 text-emerald-700'}`}>
                      {c.pipelineStage === 'evaluated' ? 'In Pool' : c.pipelineStage?.replace(/_/g,' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
