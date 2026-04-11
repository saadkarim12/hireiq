'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

interface PageProps { params: { id: string } }

const SOURCE_COLORS: Record<string,string> = {
  linkedin:'#0077B5', bayt:'#E8400C', naukri_gulf:'#4A90D9',
  agency_referral:'#0A3D2E', email:'#6B7280', hireiq_apply:'#0F6E56',
  bulk_upload:'#374151', other:'#9CA3AF',
}

export default function TalentMatchesPage({ params }: PageProps) {
  const jobId = (params as any).id
  const router = useRouter()
  const qc = useQueryClient()
  const [threshold, setThreshold] = useState(55)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviting, setInviting] = useState(false)

  const { data: jobRes } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<any>(`/jobs/${jobId}`),
  })

  const { data: matchRes, isLoading, refetch } = useQuery({
    queryKey: ['talent-matches', jobId, threshold],
    queryFn: () => api.get<any>(`/jobs/${jobId}/talent-matches?threshold=${threshold}`),
  })

  const job = jobRes?.data?.data
  const result = matchRes?.data?.data
  const matches: any[] = result?.matches || []

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(matches.map(m => m.id)))
  const clearAll = () => setSelected(new Set())

  const handleInvite = async () => {
    if (selected.size === 0) { toast.error('Select at least one candidate'); return }
    setInviting(true)
    try {
      const res = await api.post(`/jobs/${jobId}/invite-from-pool`, {
        candidateIds: Array.from(selected),
      })
      const invited = (res.data as any).data?.invited || 0
      toast.success(`${invited} candidates invited to WhatsApp screening`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['talent-matches', jobId] })
    } catch {
      toast.error('Invite failed')
    } finally {
      setInviting(false)
    }
  }

  const scoreColor = (s: number) => s >= 75 ? '#166534' : s >= 55 ? '#92400E' : '#991B1B'
  const scoreBg   = (s: number) => s >= 75 ? '#DCFCE7' : s >= 55 ? '#FEF3C7' : '#FEE2E2'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.push(`/jobs/${jobId}/pipeline`)}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Pipeline
        </button>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Talent Pool Matches</h1>
          <p className="text-gray-500 text-sm mt-1">
            {job?.title} at {job?.hiringCompany} — candidates already in your database, re-scored for this role
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Min score</span>
            <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400">
              <option value={75}>75+ (High match)</option>
              <option value={55}>55+ (Good match)</option>
              <option value={40}>40+ (Any match)</option>
            </select>
          </div>
          {selected.size > 0 && (
            <button onClick={handleInvite} disabled={inviting}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl flex items-center gap-2 disabled:opacity-60"
              style={{ background: '#0A3D2E' }}>
              {inviting
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Inviting...</>
                : `Invite ${selected.size} to WhatsApp`}
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-5 p-3 rounded-xl text-sm flex items-start gap-3" style={{ background: '#E8F5EE' }}>
        <span style={{ color: '#0A3D2E', fontSize: 16 }}>i</span>
        <div style={{ color: '#0F6E56' }}>
          These candidates were previously in your talent pool for other roles. Their CVs have been
          re-scored against <strong>{job?.title}</strong> criteria. Scores here are fresh — unrelated to any previous job score.
          Invited candidates receive a personalised WhatsApp message and go through the same screening as new applicants.
        </div>
      </div>

      {/* Candidate table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold" style={{ color: '#0A3D2E' }}>
              {isLoading ? 'Loading...' : `${matches.length} candidates matched`}
            </span>
            {matches.length > 0 && (
              <span className="text-xs text-gray-400 ml-2">for {job?.title}</span>
            )}
          </div>
          {matches.length > 0 && (
            <div className="flex gap-3 text-xs">
              <button onClick={selectAll} className="text-blue-500 hover:underline">Select all</button>
              {selected.size > 0 && <button onClick={clearAll} className="text-gray-400 hover:underline">Clear</button>}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-7 h-7 border-2 rounded-full" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="font-medium">No matches at this threshold</p>
            <p className="text-sm mt-1">Try lowering the minimum score or upload more CVs to your talent pool</p>
            <button onClick={() => router.push('/cv-inbox')}
              className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl"
              style={{ background: '#0A3D2E' }}>
              Upload CVs to Talent Pool
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0A3D2E' }}>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === matches.length && matches.length > 0}
                    onChange={e => e.target.checked ? selectAll() : clearAll()}
                    className="w-3.5 h-3.5" style={{ accentColor: '#C9A84C' }} />
                </th>
                {['Candidate','Current Role','Experience','Score for this job','Source','Skills match'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#C9A84C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matches.map((c: any, i: number) => {
                const score = c.compositeScore || 0
                const tags = (c.dataTags as any) || {}
                const evidence = tags.evidence || {}
                const skills: any[] = evidence.mustHaveSkills || []
                const isSelected = selected.has(c.id)

                return (
                  <tr key={c.id}
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${isSelected ? '' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                    style={isSelected ? { background: '#E8F5EE' } : {}}
                    onClick={() => toggleSelect(c.id)}>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)}
                        className="w-3.5 h-3.5" style={{ accentColor: '#0A3D2E' }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                          {c.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '??'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.fullName || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">{c.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.currentRole || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.yearsExperience ? `${c.yearsExperience} yrs` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold px-2.5 py-1 rounded-lg"
                          style={{ background: scoreBg(score), color: scoreColor(score) }}>
                          {score}/100
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full text-white capitalize"
                        style={{ background: SOURCE_COLORS[c.sourceChannel] || '#9CA3AF' }}>
                        {(c.sourceChannel || 'other').replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {skills.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {skills.slice(0, 4).map((s: any, si: number) => (
                            <span key={si} className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: s.found ? '#DCFCE7' : '#FEE2E2', color: s.found ? '#166534' : '#991B1B' }}>
                              {s.found ? '✓' : '✗'} {s.skill}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Bottom action bar */}
        {selected.size > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between"
            style={{ background: '#E8F5EE' }}>
            <span className="text-sm font-medium" style={{ color: '#0A3D2E' }}>
              {selected.size} candidate{selected.size !== 1 ? 's' : ''} selected
            </span>
            <button onClick={handleInvite} disabled={inviting}
              className="px-6 py-2 text-sm font-semibold text-white rounded-xl flex items-center gap-2 disabled:opacity-60"
              style={{ background: '#0A3D2E' }}>
              {inviting
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending invitations...</>
                : `Send WhatsApp invitation to ${selected.size} candidate${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
