'use client'
import { useState, useEffect } from 'react'
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
  const [selectedJobId, setSelectedJobId] = useState('')
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterScore, setFilterScore] = useState('')
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null)
  const [inviting, setInviting] = useState(false)

  const { data: jobsRes } = useQuery({
    queryKey: ['jobs-list'],
    queryFn: () => api.get<any[]>('/jobs'),
  })
  const jobs = jobsRes?.data?.data || []

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

  const handleDownload = async (candidateId: string, name: string) => {
    try {
      const token = (api as any).defaults?.headers?.Authorization || ''
      const res = await fetch(`http://localhost:3001/api/v1/candidates/${candidateId}/cv-download`, {
        headers: token ? { Authorization: token } : {}
      })
      if (!res.ok) { throw new Error('Download failed') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_CV.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    }
  }



  // Re-score candidate against selected job when drawer opens
  const [liveScore, setLiveScore] = useState<any>(null)
  const [matchedCandidates, setMatchedCandidates] = useState<any[]>([])
  // Display logic: if job selected, show re-scored matches; otherwise show all pool candidates
  const displayCandidates = selectedJobId && matchedCandidates.length > 0
    ? matchedCandidates.map((m: any) => ({
        ...m,
        // Override score with fresh job match score
        compositeScore: m.jobMatchScore ?? m.compositeScore,
        skillsMatch: m.skillsMatched || [],
      }))
    : candidates

  
  // When job is selected, re-score all candidates against it
  useEffect(() => {
    if (selectedJobId) {
      api.get<any[]>(`/jobs/${selectedJobId}/talent-matches?minScore=0`)
        .then(res => setMatchedCandidates((res.data?.data as any)?.matches || []))
        .catch(() => setMatchedCandidates([]))
    } else {
      setMatchedCandidates([])
    }
  }, [selectedJobId])
  useEffect(() => {
    if (selectedCandidate && selectedJobId) {
      setLiveScore(null)
      api.get<any[]>(`/jobs/${selectedJobId}/talent-matches?minScore=0`)
        .then(res => {
          const match = ((res.data?.data as any)?.matches || []).find((m: any) => m.id === selectedCandidate.id || m.originalCandidateId === selectedCandidate.id)
          if (match) setLiveScore({
            score: match.jobMatchScore || match.compositeScore,
            cvMatch: match.cvMatchScore,
            skills: match.skillsMatched || [],
            reason: match.matchReason || '',
          })
        })
        .catch(() => {})
    }
  }, [selectedCandidate, selectedJobId])

  const handleInviteToScreening = async (candidate: any) => {
    if (!selectedJobId) { 
      toast.error('Please select a job first using Match to Job')
      return 
    }
    setInviting(true)
    try {
      const res = await api.post(`/jobs/${selectedJobId}/invite-from-pool`, {
        candidateIds: [candidate.id]
      })
      const data = res.data as any
      if (data.success) {
        toast.success(`${candidate.fullName} invited — they will appear in the job pipeline`)
        setSelectedCandidate(null)
      } else {
        toast.error('Invite failed')
      }
    } catch {
      toast.error('Invite failed — is backend running?')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Talent Pool</h1>
          <p className="text-gray-500 text-sm mt-1">
            {selectedJobId ? `${displayCandidates.length} candidates re-scored for this job` : `${candidates.length} accepted candidates — ready to match against your open jobs`}
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

      {/* Match to job bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-3">
        <div><span className="text-sm font-medium text-gray-700 whitespace-nowrap">Match candidates to job</span><p className="text-[10px] text-gray-400 mt-0.5">Re-scores all candidates for selected job</p></div>
        <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400">
          <option value="">— Select a job to find matches —</option>
          {jobs.filter((j: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.id === j.id) === idx).map((j: any) => (
            <option key={j.id} value={j.id}>{j.title} — {j.hiringCompany}</option>
          ))}
        </select>
        {selectedJobId && (
          <button onClick={() => setSelectedJobId('')} className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-xl">
            Clear filter
          </button>
        )}
      </div>

      {/* Candidates table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
          </div>
        ) : displayCandidates.length === 0 ? (
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
                {['Name','Current Role','Experience','Score','Source','Added','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#C9A84C' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayCandidates.map((c: any, i: number) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                        {c.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '??'}
                      </div>
                      <button onClick={() => setSelectedCandidate(c)} className="text-sm font-medium text-gray-800 hover:underline text-left" style={{ color: '#0A3D2E' }}>{c.fullName || 'Unknown'}</button>
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
                  <td className="px-3 py-3">
                    <button
                      onClick={() => handleDownload(c.id, c.fullName || 'candidate')}
                      className="text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all hover:bg-gray-50"
                      style={{ borderColor: '#0A3D2E', color: '#0A3D2E' }}>
                      ↓ CV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Candidate Profile Drawer */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedCandidate(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                    style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                    {selectedCandidate.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: '#0A3D2E' }}>{selectedCandidate.fullName}</h2>
                    <p className="text-sm text-gray-500">{selectedCandidate.currentRole}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                {selectedJobId && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                    {jobs.find((j: any) => j.id === selectedJobId)?.title || 'Job selected'}
                  </span>
                )}
                <button onClick={() => setSelectedCandidate(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              </div>

              {/* Score badge */}
              {!selectedJobId && selectedCandidate.compositeScore && (
                <div className="mb-4 p-3 rounded-xl flex items-center gap-3"
                  style={{ background: selectedCandidate.compositeScore >= 75 ? '#DCFCE7' : selectedCandidate.compositeScore >= 55 ? '#FEF3C7' : '#FEE2E2' }}>
                  <span className="text-2xl font-bold"
                    style={{ color: selectedCandidate.compositeScore >= 75 ? '#166534' : selectedCandidate.compositeScore >= 55 ? '#92400E' : '#991B1B' }}>
                    {selectedCandidate.compositeScore}
                  </span>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: '#374151' }}>Previous Stored Score</p>
                    <p className="text-xs text-gray-500">
                      {(selectedCandidate.dataTags as any)?.jobTitle ? `From ${(selectedCandidate.dataTags as any).jobTitle}` : 'Historic score from last application'}
                    </p>
                  </div>
                </div>
              )}


              {/* CV-stage score for selected job */}
              {selectedJobId && (
                <div className="mb-4 p-4 rounded-xl border-2" style={{ borderColor: '#C9A84C', background: '#FDF6E3' }}>
                  <div className="text-center mb-3">
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#92400E' }}>
                      Match for: {jobs.find((j: any) => j.id === selectedJobId)?.title}
                    </p>
                    <span className="text-5xl font-bold"
                      style={{ color: (selectedCandidate.cvMatchScore || 0) >= 75 ? '#166534' : (selectedCandidate.cvMatchScore || 0) >= 55 ? '#92400E' : '#991B1B' }}>
                      {selectedCandidate.cvMatchScore || '—'}
                    </span>
                    <p className="text-xs font-semibold text-gray-700 mt-1">CV Screening Score</p>
                    <p className="text-[10px] text-gray-500">Skills + experience match for this job</p>
                  </div>

                  {((selectedCandidate.dataTags as any)?.evidence?.mustHaveSkills?.length > 0) && (
                    <div className="pt-3 border-t border-amber-200/50">
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Required Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {((selectedCandidate.dataTags as any).evidence.mustHaveSkills || []).map((s: any, i: number) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{ background: s.found ? '#DCFCE7' : '#FEE2E2', color: s.found ? '#166534' : '#991B1B' }}>
                            {s.found ? '✓' : '✗'} {s.skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCandidate.hardFilterPass !== undefined && (
                    <div className="mt-2 text-[10px] text-center">
                      {selectedCandidate.hardFilterPass
                        ? <span className="text-green-700 font-medium">✓ Passes all required filters</span>
                        : <span className="text-red-700 font-medium">✗ {selectedCandidate.hardFilterFailReason || 'Fails required filters'}</span>}
                    </div>
                  )}

                  <p className="text-[10px] text-center text-gray-500 mt-3 italic">
                    Full screening (commitment + salary fit) happens after WhatsApp invitation
                  </p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase mb-1">Contact</p>
                  <p className="text-sm text-gray-700">{selectedCandidate.email || '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase mb-1">Experience</p>
                    <p className="text-sm font-medium text-gray-700">{selectedCandidate.yearsExperience ? `${selectedCandidate.yearsExperience} years` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase mb-1">Salary Expected</p>
                    <p className="text-sm font-medium text-gray-700">
                      {selectedCandidate.salaryExpectation ? `AED ${selectedCandidate.salaryExpectation.toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase mb-1">Source</p>
                  <span className="text-xs px-2 py-0.5 rounded-full text-white capitalize"
                    style={{ background: '#0A3D2E' }}>
                    {(selectedCandidate.sourceChannel || 'other').replace(/_/g,' ')}
                  </span>
                </div>

                {/* Skills */}
                {(selectedCandidate.cvStructured as any)?.skills?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {((selectedCandidate.cvStructured as any)?.skills || []).map((s: string, i: number) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Work Experience */}
                {((selectedCandidate.cvStructured as any)?.experience?.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase mb-2">Work Experience</p>
                    <div className="space-y-2">
                      {((selectedCandidate.cvStructured as any)?.experience || []).slice(0, 4).map((exp: any, i: number) => (
                        <div key={i} className="p-3 rounded-xl border border-gray-100">
                          <p className="text-sm font-medium text-gray-800">{exp.title || exp.role || 'Role'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {exp.company || 'Company'}
                            {exp.duration || exp.period ? ` · ${exp.duration || exp.period}` : ''}
                          </p>
                          {exp.description && (
                            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{exp.description.slice(0, 180)}{exp.description.length > 180 ? '...' : ''}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Education */}
                {((selectedCandidate.cvStructured as any)?.education) && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase mb-2">Education</p>
                    <div className="p-3 rounded-xl border border-gray-100">
                      <p className="text-sm text-gray-700">
                        {typeof (selectedCandidate.cvStructured as any).education === 'string'
                          ? (selectedCandidate.cvStructured as any).education
                          : JSON.stringify((selectedCandidate.cvStructured as any).education).slice(0, 200)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Certifications */}
                {((selectedCandidate.cvStructured as any)?.certifications?.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase mb-2">Certifications</p>
                    <div className="flex flex-wrap gap-1.5">
                      {((selectedCandidate.cvStructured as any)?.certifications || []).slice(0, 8).map((c: string, i: number) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Job History */}
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase mb-2">Applied Jobs</p>
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800">
                          {(selectedCandidate.dataTags as any)?.jobTitle || selectedCandidate.currentRole || 'Current role'}
                        </p>
                        {!selectedJobId && selectedCandidate.compositeScore && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                            {selectedCandidate.compositeScore}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {selectedCandidate.pipelineStage?.replace(/_/g,' ')} · {selectedCandidate.createdAt ? new Date(selectedCandidate.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-col gap-2">
                {selectedJobId ? (
                  <button
                    onClick={() => handleInviteToScreening(selectedCandidate)}
                    disabled={inviting}
                    className="w-full py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: '#0A3D2E' }}>
                    {inviting
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Inviting...</>
                      : '💬 Invite to WhatsApp Screening'}
                  </button>
                ) : (
                  <div className="p-3 rounded-xl text-xs text-center" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    Select a job using "Match to job" above to invite this candidate
                  </div>
                )}
                <button
                  onClick={() => handleDownload(selectedCandidate.id, selectedCandidate.fullName || 'candidate')}
                  className="w-full py-2.5 text-sm font-semibold rounded-xl border-2 transition-all"
                  style={{ borderColor: '#0A3D2E', color: '#0A3D2E' }}>
                  ↓ Download CV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
