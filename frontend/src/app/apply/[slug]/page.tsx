'use client'
// Public, unauthenticated job application page.
// Lives outside (dashboard) so there's no sidebar, no JWT, no recruiter UI.
// Hits /api/v1/public/jobs/:slug — see backend/src/core-api/routes/public-apply.ts.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type ScreeningQ = { id: string; questionTextEn: string; questionTextAr?: string; type: string }
type PublicJob = {
  id: string
  title: string
  hiringCompany: string
  locationCity: string
  locationCountry: string
  jobType: string
  salaryMin: number
  salaryMax: number
  currency: string
  requiredSkills: string[]
  preferredSkills: string[]
  minExperienceYears: number
  jdText: string
  screeningQuestions: ScreeningQ[]
  isAcceptingApplications: boolean
}

export default function PublicApplyPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [job, setJob] = useState<PublicJob | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [consent, setConsent] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // Candidate profile fields
  const [currentRole, setCurrentRole] = useState('')
  const [yearsExperience, setYearsExperience] = useState('')
  const [currentCity, setCurrentCity] = useState('')
  const [currentSalary, setCurrentSalary] = useState('')
  const [expectedSalary, setExpectedSalary] = useState('')
  const [noticePeriodDays, setNoticePeriodDays] = useState('30')
  const [visaStatus, setVisaStatus] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/public/jobs/${encodeURIComponent(slug)}`)
        const data = await r.json()
        if (cancelled) return
        if (!data.success) {
          setLoadError(data?.error?.message || 'Job not found')
        } else {
          setJob(data.data)
        }
      } catch {
        if (!cancelled) setLoadError('Could not reach server. Please try again later.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  const validateFile = (f: File): string | null => {
    if (f.size > 5 * 1024 * 1024) return 'File must be under 5 MB'
    const ok = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!ok.includes(f.type)) return 'Please upload a PDF or Word document'
    return null
  }

  const handleFile = (f: File | null) => {
    if (!f) { setCvFile(null); return }
    const err = validateFile(f)
    if (err) { setSubmitError(err); return }
    setSubmitError(null)
    setCvFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    if (!job || !slug) return
    if (!cvFile) { setSubmitError('Please attach your CV'); return }
    if (!consent) { setSubmitError('Please agree to the data processing notice'); return }
    if (!/^\+?[0-9 ()-]{6,20}$/.test(phone)) { setSubmitError('Please enter a valid phone number'); return }
    if (!expectedSalary || Number(expectedSalary) <= 0) { setSubmitError('Please enter your expected salary'); return }
    if (noticePeriodDays === '' || isNaN(Number(noticePeriodDays))) { setSubmitError('Please select your notice period'); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('fullName', fullName)
      fd.append('email', email)
      fd.append('phone', phone)
      fd.append('consent', 'true')
      fd.append('website', website) // honeypot — should be empty
      fd.append('expectedSalary', String(Number(expectedSalary)))
      fd.append('noticePeriodDays', String(Number(noticePeriodDays)))
      if (currentRole.trim())     fd.append('currentRole', currentRole.trim())
      if (yearsExperience.trim()) fd.append('yearsExperience', String(Number(yearsExperience)))
      if (currentSalary.trim())   fd.append('currentSalary', String(Number(currentSalary)))
      if (visaStatus)             fd.append('visaStatus', visaStatus)
      if (currentCity.trim())     fd.append('currentCity', currentCity.trim())
      fd.append('answers', JSON.stringify(
        Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }))
      ))
      fd.append('cv', cvFile)

      const r = await fetch(`${API_BASE}/api/v1/public/jobs/${encodeURIComponent(slug)}/apply`, {
        method: 'POST',
        body: fd,
      })
      const data = await r.json()
      if (!r.ok || !data.success) {
        setSubmitError(data?.error?.message || 'Submission failed')
        return
      }
      setSubmitted(true)
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render states ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Loading…</div>
      </div>
    )
  }

  if (loadError || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Job not available</h1>
          <p className="text-sm text-gray-500">{loadError || 'This job posting is no longer accessible.'}</p>
        </div>
      </div>
    )
  }

  if (!job.isAcceptingApplications) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">📪</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">No longer accepting applications</h1>
          <p className="text-sm text-gray-500 mb-1"><span className="font-semibold">{job.title}</span> at {job.hiringCompany}</p>
          <p className="text-xs text-gray-400 mt-3">If you believe this is an error, please contact the recruiter directly.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Application received</h1>
          <p className="text-sm text-gray-500">
            Thanks, {fullName.split(' ')[0] || 'there'} — your application for{' '}
            <span className="font-semibold">{job.title}</span> at {job.hiringCompany} has been submitted.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            You may receive a WhatsApp message from our screening assistant. We won't spam you.
          </p>
        </div>
      </div>
    )
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 transition-colors bg-white"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Job header */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
          <h1 className="text-2xl font-bold text-brand-navy mb-1">{job.title}</h1>
          <p className="text-sm text-gray-600 mb-4">{job.hiringCompany}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-4">
            <span>📍 {job.locationCity}, {job.locationCountry}</span>
            <span className="capitalize">🏢 {job.jobType}</span>
            <span>💰 {job.currency} {job.salaryMin.toLocaleString()}–{job.salaryMax.toLocaleString()}</span>
            <span>🎯 {job.minExperienceYears}+ years</span>
          </div>
          {job.requiredSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {job.requiredSkills.map(s => (
                <span key={s} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full font-medium">{s}</span>
              ))}
            </div>
          )}
          {job.jdText && (
            <details className="text-sm text-gray-600">
              <summary className="cursor-pointer text-brand-blue font-medium hover:underline">Read full description</summary>
              <div className="mt-3 whitespace-pre-wrap text-gray-700">{job.jdText}</div>
            </details>
          )}
        </div>

        {/* Form */}
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-gray-800">Apply for this role</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full name *</label>
              <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={200} />
            </div>
            <div>
              <label className={labelCls}>Email *</label>
              <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={300} />
            </div>
          </div>

          <div>
            <label className={labelCls}>WhatsApp number *</label>
            <input
              className={inputCls}
              type="tel"
              placeholder="+971 50 123 4567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              maxLength={20}
            />
            <p className="text-xs text-gray-400 mt-1">We may message you on WhatsApp for screening questions.</p>
          </div>

          {/* About you (optional — CV will fill the rest) */}
          <div className="pt-2 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3">About you</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Current role</label>
                <input
                  className={inputCls}
                  value={currentRole}
                  onChange={e => setCurrentRole(e.target.value)}
                  placeholder="e.g. Senior Cloud Architect"
                  maxLength={300}
                />
              </div>
              <div>
                <label className={labelCls}>Years of experience</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  max={60}
                  value={yearsExperience}
                  onChange={e => setYearsExperience(e.target.value)}
                  placeholder="e.g. 7"
                />
              </div>
              <div>
                <label className={labelCls}>Current city</label>
                <input
                  className={inputCls}
                  value={currentCity}
                  onChange={e => setCurrentCity(e.target.value)}
                  placeholder="e.g. Dubai"
                  maxLength={120}
                />
              </div>
              <div>
                <label className={labelCls}>Visa status</label>
                <select
                  className={inputCls}
                  value={visaStatus}
                  onChange={e => setVisaStatus(e.target.value)}
                >
                  <option value="">Select…</option>
                  <option value="citizen">UAE / KSA / GCC Citizen</option>
                  <option value="residence_transferable">Residence visa (transferable)</option>
                  <option value="residence_non_transferable">Residence visa (non-transferable)</option>
                  <option value="own_visa">Own visa / freelance permit</option>
                  <option value="need_sponsorship">Need sponsorship</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Compensation & availability */}
          <div className="pt-2 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3">
              Compensation &amp; availability <span className="text-red-500 font-normal">*</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Current salary ({job.currency} / month)</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={currentSalary}
                  onChange={e => setCurrentSalary(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className={labelCls}>Expected salary ({job.currency} / month) *</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={expectedSalary}
                  onChange={e => setExpectedSalary(e.target.value)}
                  required
                  placeholder="e.g. 25000"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Notice period *</label>
                <select
                  className={inputCls}
                  value={noticePeriodDays}
                  onChange={e => setNoticePeriodDays(e.target.value)}
                  required
                >
                  <option value="0">Immediate / available now</option>
                  <option value="14">Less than 1 month</option>
                  <option value="30">1 month</option>
                  <option value="60">2 months</option>
                  <option value="90">3 months</option>
                  <option value="120">More than 3 months</option>
                </select>
              </div>
            </div>
          </div>

          {/* Honeypot — visually hidden, real users won't fill it */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
            <label>Website</label>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={e => setWebsite(e.target.value)}
            />
          </div>

          {/* CV upload */}
          <div>
            <label className={labelCls}>CV / Resume *</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0] || null)}
              />
              {cvFile ? (
                <div className="text-sm">
                  <div className="font-semibold text-gray-700">📄 {cvFile.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{(cvFile.size / 1024).toFixed(0)} KB · click to change</div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📤</div>
                  <p className="text-sm font-medium text-gray-600">Drop your CV here, or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">PDF or Word · max 5 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Screening questions */}
          {job.screeningQuestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800">A few questions</h3>
              {job.screeningQuestions.map((q, i) => (
                <div key={q.id || i}>
                  <label className={labelCls}>{q.questionTextEn}</label>
                  <textarea
                    className={inputCls}
                    rows={3}
                    maxLength={2000}
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Consent */}
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              required
            />
            <span>
              I agree that {job.hiringCompany} and HireIQ may store and process my CV and contact details
              for the purpose of evaluating this application.
            </span>
          </label>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-navy text-white rounded-xl py-3 font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0A3D2E' }}
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Powered by HireIQ · We never share your data with third parties without consent.
          </p>
        </form>
      </div>
    </div>
  )
}
