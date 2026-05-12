'use client'
import { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import apiClient from '@/api/client'
import { toast } from 'react-hot-toast'

type InboxRow = {
  id: string
  cvScreeningScore: number | null
}

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [sourceChannel, setSourceChannel] = useState('linkedin')
  const [pdplConsent, setPdplConsent] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [processingCount, setProcessingCount] = useState(0)
  const [processedCount, setProcessedCount] = useState(0)

  const { data: jobsRes } = useQuery({
    queryKey: ['jobs-active'],
    queryFn: () => api.get<any[]>('/jobs'),
  })

  const jobs = jobsRes?.data?.data || []

  // Background poll the inbox endpoint just to drive the processing banner's
  // "X of Y scored" counter after an upload. Nothing is rendered from this.
  const { refetch: refetchInbox } = useQuery({
    queryKey: ['cv-inbox'],
    queryFn: () => api.get<InboxRow[]>(`/cv-inbox?status=all&maxDays=7`),
    refetchInterval: processingCount > 0 ? 8000 : false,
    enabled: processingCount > 0,
  })

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
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
    if (!selectedJobId) { toast.error('Please select a job to match CVs against'); return }
    if (!pdplConsent) { toast.error('PDPL consent required'); return }
    setIsUploading(true)
    try {
      const formData = new FormData()
      uploadFiles.forEach(f => formData.append('cvFiles', f))
      formData.append('sourceChannel', sourceChannel)
      formData.append('pdplConsent', 'true')
      if (selectedJobId) formData.append('jobId', selectedJobId)

      const authHeader = (apiClient.defaults.headers as any)?.Authorization || ''

      const res = await fetch('http://localhost:3001/api/v1/bulk-upload', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${data.data.queued} CVs queued — AI is parsing them now`)
        setUploadFiles([]); setPdplConsent(false)
        setProcessingCount(data.data.queued); setProcessedCount(0)
        // Refetch the inbox list a few times — each fresh row that lands
        // bumps the displayed count and surfaces it under the right tab.
        let polls = 0
        const interval = setInterval(async () => {
          polls++
          try {
            const r = await refetchInbox()
            const rows = (r.data?.data?.data as InboxRow[] | undefined) || []
            const scored = rows.filter(c => c.cvScreeningScore != null)
            setProcessedCount(Math.min(scored.length, data.data.queued))
          } catch {}
          if (polls >= 12) clearInterval(interval) // stop after 60s
        }, 5000)
      } else {
        toast.error(data.error?.message || 'Upload failed')
      }
    } catch { toast.error('Upload failed — is backend running?') }
    finally { setIsUploading(false) }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>CV Inbox</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload CVs from any source. AI parses each one and routes them to the matched job pipeline.
        </p>
      </div>

      {/* Flow explanation */}
      <div className="flex items-center gap-2 mb-6 p-3 rounded-xl text-sm" style={{ background: '#E8F5EE' }}>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#0A3D2E' }}>1 Upload</span>
          <span className="text-gray-400">→</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#C9A84C' }}>2 AI Parses</span>
          <span className="text-gray-400">→</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#166534' }}>3 Job Pipeline</span>
        </div>
        <span className="text-green-700 ml-2">Parsed CVs land in the matched job&rsquo;s Applied column for recruiter review.</span>
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
              Match against job <span className="text-red-500 text-xs font-medium">*</span>
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

      {/* Processing status banner */}
      {processingCount > 0 && (
        <div className="mb-4 rounded-xl p-4 border flex items-center gap-3"
          style={{ background: processedCount >= processingCount ? '#DCFCE7' : '#FDF6E3', borderColor: processedCount >= processingCount ? '#86EFAC' : '#FDE68A' }}>
          {processedCount >= processingCount ? (
            <span className="text-lg">✅</span>
          ) : (
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: '#C9A84C' }} />
          )}
          <div>
            <p className="text-sm font-semibold" style={{ color: processedCount >= processingCount ? '#166534' : '#92400E' }}>
              {processedCount >= processingCount
                ? `All ${processingCount} CVs processed`
                : `AI is parsing CVs... ${processedCount} of ${processingCount} done`}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {processedCount >= processingCount
                ? 'Accepted candidates are in the job pipeline. Open the job to review.'
                : 'This takes about 10-15 seconds per CV.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
