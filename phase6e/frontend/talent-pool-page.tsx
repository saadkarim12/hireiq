'use client'
import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { toast } from 'react-hot-toast'

const SOURCES = [
  { value: 'linkedin',       label: '💼 LinkedIn' },
  { value: 'bayt',           label: '🌐 Bayt.com' },
  { value: 'naukri_gulf',    label: '🔍 Naukri Gulf' },
  { value: 'agency_referral',label: '🤝 Agency Referral' },
  { value: 'email',          label: '📧 Email / Direct' },
  { value: 'walk_in',        label: '🚶 Walk-in' },
  { value: 'other',          label: '📁 Other' },
]

const SOURCE_COLORS: Record<string,string> = {
  linkedin:'#0077B5', bayt:'#E8400C', naukri_gulf:'#4A90D9',
  agency_referral:'#0A3D2E', email:'#6B7280', walk_in:'#7C3AED',
  talent_pool_match:'#C9A84C', bulk_upload:'#374151', other:'#9CA3AF', hireiq_apply:'#0F6E56',
}

function ScoreBadge({ score }: { score: number | null }) {
  if (!score) return <span className="text-xs text-gray-400">—</span>
  const color = score >= 75 ? '#166534' : score >= 55 ? '#92400E' : '#991B1B'
  const bg    = score >= 75 ? '#DCFCE7' : score >= 55 ? '#FEF3C7' : '#FEE2E2'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
      {score}
    </span>
  )
}

export default function TalentPoolPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [sourceChannel, setSourceChannel] = useState('linkedin')
  const [pdplConsent, setPdplConsent] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterScore, setFilterScore] = useState('')

  const { data: jobsRes } = useQuery({
    queryKey: ['jobs-active'],
    queryFn: () => api.get<any[]>('/jobs?status=active'),
  })

  const { data: poolRes, isLoading } = useQuery({
    queryKey: ['talent-pool', search, filterSource, filterScore],
    queryFn: () => api.get<any[]>(`/talent-pool/search?q=${search}&source=${filterSource}&minScore=${filterScore}&maxDays=90`),
  })

  const jobs = jobsRes?.data?.data || []
  const candidates = poolRes?.data?.data || []

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' ||
      f.name.endsWith('.docx') || f.name.endsWith('.doc')
    )
    setUploadFiles(prev => [...prev, ...files].slice(0, 50))
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setUploadFiles(prev => [...prev, ...files].slice(0, 50))
  }

  const handleUpload = async () => {
    if (!uploadFiles.length) { toast.error('Add at least one CV'); return }
    if (!pdplConsent) { toast.error('PDPL consent is required'); return }

    setIsUploading(true)
    try {
      const formData = new FormData()
      uploadFiles.forEach(f => formData.append('cvFiles', f))
      formData.append('sourceChannel', sourceChannel)
      formData.append('pdplConsent', 'true')
      if (selectedJobId) formData.append('jobId', selectedJobId)

      const res = await fetch('http://localhost:3001/api/v1/bulk-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${(api as any).defaults?.headers?.common?.Authorization?.replace('Bearer ', '') || ''}` },
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        setUploadResult(data.data)
        setUploadFiles([])
        setPdplConsent(false)
        toast.success(`${data.data.queued} CVs queued for processing`)
        setTimeout(() => qc.invalidateQueries({ queryKey: ['talent-pool'] }), 5000)
      } else {
        toast.error(data.error?.message || 'Upload failed')
      }
    } catch {
      toast.error('Upload failed — check backend is running')
    } finally {
      setIsUploading(false)
    }
  }

  const sourceBreakdown = candidates.reduce((acc: any, c: any) => {
    const s = c.sourceChannel || 'other'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Talent Pool</h1>
          <p className="text-gray-500 text-sm mt-1">
            {candidates.length} candidates in the last 90 days
          </p>
        </div>
        <button
          onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}
          className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl"
          style={{ background: '#0A3D2E' }}>
          + Upload CVs
        </button>
      </div>

      {/* Source breakdown */}
      {Object.keys(sourceBreakdown).length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Object.entries(sourceBreakdown).map(([source, count]: any) => (
            <div key={source} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SOURCE_COLORS[source] || '#9CA3AF' }} />
              <div>
                <div className="text-xs text-gray-500 capitalize">{source.replace(/_/g, ' ')}</div>
                <div className="text-lg font-bold" style={{ color: '#0A3D2E' }}>{count}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search and filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or role..."
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
        />
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none">
          <option value="">All sources</option>
          {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterScore} onChange={e => setFilterScore(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none">
          <option value="">All scores</option>
          <option value="75">High match (75+)</option>
          <option value="55">Good match (55+)</option>
          <option value="40">Any scored (40+)</option>
        </select>
      </div>

      {/* Candidate list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📁</div>
            <p className="font-medium">No candidates yet</p>
            <p className="text-sm mt-1">Upload CVs below to start building your talent pool</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0A3D2E' }}>
                {['Name', 'Current Role', 'Experience', 'Score', 'Source', 'Added', 'Status'].map(h => (
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
                        {c.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{c.fullName || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.currentRole || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {c.yearsExperience ? `${c.yearsExperience} yrs` : '—'}
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={c.compositeScore} /></td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white capitalize"
                      style={{ background: SOURCE_COLORS[c.sourceChannel] || '#9CA3AF' }}>
                      {(c.sourceChannel || 'other').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                      c.pipelineStage === 'shortlisted' ? 'bg-green-100 text-green-700' :
                      c.pipelineStage === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{c.pipelineStage?.replace(/_/g, ' ') || 'applied'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload section */}
      <div id="upload-section" className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: '#0A3D2E' }}>Upload CVs</h2>
        <p className="text-sm text-gray-500 mb-5">Upload up to 50 CVs at once from LinkedIn, Bayt, email or any source. AI will parse and score each one automatically.</p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-5 ${
            isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
          }`}>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
          <div className="text-3xl mb-2">📂</div>
          {uploadFiles.length > 0 ? (
            <div>
              <p className="font-semibold text-gray-800">{uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected</p>
              <p className="text-sm text-gray-400 mt-1">Click to add more (max 50)</p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-3 max-h-24 overflow-y-auto">
                {uploadFiles.map((f, i) => (
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded flex items-center gap-1">
                    {f.name.slice(0, 25)}{f.name.length > 25 ? '...' : ''}
                    <button onClick={e => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_, j) => j !== i)) }}
                      className="text-emerald-400 hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-600">Drag and drop CVs here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse — PDF or Word, up to 50 files</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Source Channel *</label>
            <select value={sourceChannel} onChange={e => setSourceChannel(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Score against job <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
              <option value="">Add to talent pool only</option>
              {jobs.map((j: any) => (
                <option key={j.id} value={j.id}>{j.title} — {j.hiringCompany}</option>
              ))}
            </select>
          </div>
        </div>

        {/* PDPL consent */}
        <label className="flex items-start gap-3 cursor-pointer mb-5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <input type="checkbox" checked={pdplConsent} onChange={e => setPdplConsent(e.target.checked)}
            className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ accentColor: '#0A3D2E' }} />
          <span className="text-xs text-blue-800">
            <strong>PDPL Consent (Required)</strong> — I confirm these candidates originally consented to their data being processed for recruitment purposes, in compliance with UAE Personal Data Protection Law (PDPL) Article 4.
          </span>
        </label>

        {uploadResult && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            ✅ {uploadResult.message}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={isUploading || uploadFiles.length === 0 || !pdplConsent}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          style={{ background: '#0A3D2E' }}>
          {isUploading ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing CVs...</>
          ) : `✨ Process ${uploadFiles.length || ''} CVs with AI →`}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          CVs are processed in the background. Results appear in the table above within a few minutes.
          Unscreened CVs are automatically deleted after 90 days per PDPL policy.
        </p>
      </div>
    </div>
  )
}
