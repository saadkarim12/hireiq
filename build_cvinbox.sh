#!/bin/bash
echo "🔨 Building CV Inbox + cleaning Talent Pool..."

# ── 1. CREATE CV INBOX PAGE ───────────────────────────────────────────────────
mkdir -p ~/hireiq/frontend/src/app/\(dashboard\)/cv-inbox

cat > ~/hireiq/frontend/src/app/\(dashboard\)/cv-inbox/page.tsx << 'TSXEOF'
'use client'
import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { toast } from 'react-hot-toast'

const SOURCES = [
  { value: 'linkedin',        label: '💼 LinkedIn' },
  { value: 'bayt',            label: '🌐 Bayt.com' },
  { value: 'naukri_gulf',     label: '🔍 Naukri Gulf' },
  { value: 'agency_referral', label: '🤝 Agency Referral' },
  { value: 'email',           label: '📧 Email / Direct' },
  { value: 'walk_in',         label: '🚶 Walk-in' },
  { value: 'other',           label: '📁 Other' },
]

export default function CvInboxPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [sourceChannel, setSourceChannel] = useState('linkedin')
  const [pdplConsent, setPdplConsent] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  const { data: jobsRes } = useQuery({
    queryKey: ['jobs-active'],
    queryFn: () => api.get<any[]>('/jobs'),
  })

  const { data: inboxRes, isLoading, refetch } = useQuery({
    queryKey: ['cv-inbox'],
    queryFn: () => api.get<any[]>('/talent-pool/search?maxDays=7'),
    refetchInterval: uploadDone ? 5000 : false,
  })

  const jobs = jobsRes?.data?.data || []
  const inboxCandidates = (inboxRes?.data?.data || []).filter(
    (c: any) => c.pipelineStage === 'applied' && (c.dataTags as any)?.bulkUploaded
  )

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.name.endsWith('.docx') || f.name.endsWith('.doc')
    )
    setUploadFiles(prev => [...prev, ...files].slice(0, 50))
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 50))
  }

  const handleUpload = async () => {
    if (!uploadFiles.length) { toast.error('Select at least one CV'); return }
    if (!pdplConsent) { toast.error('PDPL consent required'); return }
    setIsUploading(true)
    try {
      const formData = new FormData()
      uploadFiles.forEach(f => formData.append('cvFiles', f))
      formData.append('sourceChannel', sourceChannel)
      formData.append('pdplConsent', 'true')
      if (selectedJobId) formData.append('jobId', selectedJobId)

      const clientDefaults = (api as any).defaults
      const authHeader = clientDefaults?.headers?.common?.Authorization || ''

      const res = await fetch('http://localhost:3001/api/v1/bulk-upload', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${data.data.queued} CVs queued — AI is parsing them now`)
        setUploadFiles([]); setPdplConsent(false); setUploadDone(true)
        setTimeout(() => refetch(), 8000)
      } else {
        toast.error(data.error?.message || 'Upload failed')
      }
    } catch { toast.error('Upload failed — is backend running?') }
    finally { setIsUploading(false) }
  }

  const accept = useMutation({
    mutationFn: (id: string) => api.patch(`/candidates/${id}/status`, { pipelineStage: 'evaluated' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cv-inbox'] }); toast.success('Moved to Talent Pool') },
  })

  const reject = useMutation({
    mutationFn: (id: string) => api.patch(`/candidates/${id}/status`, { pipelineStage: 'rejected' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cv-inbox'] }); toast.success('CV rejected') },
  })

  const acceptAll = async () => {
    for (const c of inboxCandidates) {
      await api.patch(`/candidates/${c.id}/status`, { pipelineStage: 'evaluated' })
    }
    qc.invalidateQueries({ queryKey: ['cv-inbox'] })
    toast.success(`${inboxCandidates.length} CVs moved to Talent Pool`)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>CV Inbox</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload CVs from any source. AI parses each one. Review and accept good candidates to your Talent Pool.
        </p>
      </div>

      {/* Flow explanation */}
      <div className="flex items-center gap-2 mb-6 p-3 rounded-xl text-sm" style={{ background: '#E8F5EE' }}>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#0A3D2E' }}>1 Upload</span>
          <span className="text-gray-400">→</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#C9A84C' }}>2 AI Parses</span>
          <span className="text-gray-400">→</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#0F6E56' }}>3 You Review</span>
          <span className="text-gray-400">→</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#166534' }}>4 Talent Pool</span>
        </div>
        <span className="text-green-700 ml-2">Accepted CVs go to Talent Pool and can be matched against any job</span>
      </div>

      {/* Upload zone */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4" style={{ color: '#0A3D2E' }}>Upload CVs</h2>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4 ${
            isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
          }`}>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
          <div className="text-3xl mb-2">📂</div>
          {uploadFiles.length > 0 ? (
            <div>
              <p className="font-semibold text-gray-800">{uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} ready to upload</p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-2 max-h-16 overflow-y-auto">
                {uploadFiles.map((f, i) => (
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded flex items-center gap-1">
                    {f.name.slice(0, 22)}{f.name.length > 22 ? '...' : ''}
                    <button onClick={e => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_,j) => j !== i)) }}
                      className="text-emerald-400 hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-600">Drag and drop CVs here</p>
              <p className="text-sm text-gray-400 mt-1">PDF or Word — up to 50 files at once</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Source *</label>
            <select value={sourceChannel} onChange={e => setSourceChannel(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Score against job <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
              <option value="">No job — just parse and store</option>
              {jobs.map((j: any) => (
                <option key={j.id} value={j.id}>{j.title} — {j.hiringCompany}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
          <input type="checkbox" checked={pdplConsent} onChange={e => setPdplConsent(e.target.checked)}
            className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ accentColor: '#0A3D2E' }} />
          <span className="text-xs text-blue-800">
            <strong>PDPL Consent (Required)</strong> — I confirm these candidates consented to their data being processed for recruitment purposes, in compliance with UAE PDPL Article 4.
          </span>
        </label>

        <button onClick={handleUpload} disabled={isUploading || !uploadFiles.length || !pdplConsent}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          style={{ background: '#0A3D2E' }}>
          {isUploading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI is processing CVs...</>
            : `✨ Upload and Parse ${uploadFiles.length > 0 ? uploadFiles.length + ' CVs' : 'CVs'} →`}
        </button>
      </div>

      {/* CV Review table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Pending Review</h2>
            <p className="text-xs text-gray-400 mt-0.5">CVs uploaded in the last 7 days awaiting your decision</p>
          </div>
          {inboxCandidates.length > 0 && (
            <div className="flex gap-2">
              <button onClick={acceptAll}
                className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: '#0A3D2E' }}>
                Accept all ({inboxCandidates.length}) → Talent Pool
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
          </div>
        ) : inboxCandidates.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">📬</div>
            <p className="font-medium text-sm">Inbox is empty</p>
            <p className="text-xs mt-1">Upload CVs above — they will appear here once AI finishes parsing (takes ~1 min)</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Candidate','Role','Experience','Source','Score','Decision'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inboxCandidates.map((c: any, i: number) => {
                const score = c.compositeScore
                const scoreColor = score >= 75 ? '#166534' : score >= 55 ? '#92400E' : score ? '#991B1B' : '#9CA3AF'
                const scoreBg   = score >= 75 ? '#DCFCE7' : score >= 55 ? '#FEF3C7' : score ? '#FEE2E2' : '#F3F4F6'
                return (
                  <tr key={c.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                          {c.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '??'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.fullName || 'Parsing...'}</p>
                          <p className="text-xs text-gray-400">{c.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.currentRole || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.yearsExperience ? `${c.yearsExperience} yrs` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8F5EE', color: '#0A3D2E' }}>
                        {(c.sourceChannel || 'other').replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {score ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: scoreBg, color: scoreColor }}>
                          {score}
                        </span>
                      ) : <span className="text-xs text-gray-400">Scoring...</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => accept.mutate(c.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-all"
                          style={{ background: '#0A3D2E' }}>
                          ✓ Accept
                        </button>
                        <button onClick={() => reject.mutate(c.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-all">
                          ✗ Reject
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
    </div>
  )
}
TSXEOF
echo "  ✅ CV Inbox page created"

# ── 2. CLEAN TALENT POOL — Remove upload, show only accepted candidates ────────
cat > ~/hireiq/frontend/src/app/\(dashboard\)/talent-pool/page.tsx << 'TSXEOF'
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
    ['evaluated','shortlisted','screening','advanced'].includes(c.pipelineStage)
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
TSXEOF
echo "  ✅ Talent Pool page updated — upload removed, shows accepted only"

# ── 3. UPDATE SIDEBAR ─────────────────────────────────────────────────────────
python3 << 'PYEOF'
import os, re

# Find sidebar
sidebar_paths = [
    '~/hireiq/frontend/src/components/layout/Sidebar.tsx',
    '~/hireiq/frontend/src/components/Sidebar.tsx',
    '~/hireiq/frontend/src/app/(dashboard)/layout.tsx',
]

found = None
for sp in sidebar_paths:
    expanded = os.path.expanduser(sp)
    if os.path.exists(expanded):
        found = expanded
        break

if not found:
    # Search for it
    import subprocess
    result = subprocess.run(['find', os.path.expanduser('~/hireiq/frontend/src'), '-name', '*.tsx'],
        capture_output=True, text=True)
    files = result.stdout.strip().split('\n')
    for f in files:
        if os.path.exists(f):
            content = open(f).read()
            if 'href' in content and ('jobs' in content or 'dashboard' in content) and 'nav' in content.lower():
                found = f
                break

if not found:
    print("  ⚠️  Sidebar not found — add CV Inbox manually to navigation")
    exit()

with open(found, 'r') as f:
    content = f.read()

print(f"  Found navigation in: {found}")

# Add cv-inbox if not there
if 'cv-inbox' not in content:
    # Try to add after talent-pool or jobs
    for pattern, replacement in [
        ("'/talent-pool'", "'/cv-inbox'"),
        ("href: '/jobs'", "href: '/cv-inbox'"),
    ]:
        if pattern in content:
            # Don't replace, insert after
            break

    # Add to nav items array if we can find the pattern
    content = re.sub(
        r"(\{[^}]*href['\"]:\s*['\"]\/talent-pool['\"][^}]*\})",
        r"{ href: '/cv-inbox', label: 'CV Inbox', icon: '📬' },\n    \1",
        content
    )
    if 'cv-inbox' not in content:
        content = re.sub(
            r"(\{[^}]*href['\"]:\s*['\"]\/jobs['\"][^}]*\})",
            r"\1,\n    { href: '/cv-inbox', label: 'CV Inbox', icon: '📬' }",
            content
        )

    with open(found, 'w') as f:
        f.write(content)
    print("  ✅ CV Inbox added to sidebar")
else:
    print("  ✅ CV Inbox already in sidebar")
PYEOF

# Clear cache
rm -rf ~/hireiq/frontend/.next
echo "  ✅ Cache cleared"
echo ""
echo "✅ Done! Restart frontend: cd ~/hireiq/frontend && npm run dev"
echo ""
echo "New pages:"
echo "  http://localhost:3000/cv-inbox     — Upload CVs, review, accept to pool"
echo "  http://localhost:3000/talent-pool  — Clean curated pool, accepted candidates only"
