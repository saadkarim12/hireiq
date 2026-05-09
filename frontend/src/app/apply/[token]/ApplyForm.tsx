'use client'
// Client component — handles dropzone, validation, submit, and the post-submit
// states. Honeypot is rendered invisibly so bots fill it; humans never see it.
// Turnstile widget conditionally rendered when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set; the matching backend secret activates server-side verification.
import { useState, useRef, ChangeEvent, DragEvent, FormEvent } from 'react'
import Script from 'next/script'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

const ACCEPT_EXT = ['pdf', 'doc', 'docx']
const MAX_BYTES  = 5 * 1024 * 1024

type Question = { id: string; text: string }
type Props = { token: string; jobTitle: string; questions: Question[] }
type Status = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error'

export function ApplyForm({ token, jobTitle, questions }: Props) {
  const [status, setStatus]     = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [file, setFile]         = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(picked: File | null | undefined) {
    setFileError('')
    if (!picked) return setFile(null)
    const ext = picked.name.toLowerCase().split('.').pop() || ''
    if (!ACCEPT_EXT.includes(ext)) {
      setFile(null); setFileError('Please upload a PDF, DOC, or DOCX file.')
      return
    }
    if (picked.size > MAX_BYTES) {
      setFile(null); setFileError('File must be 5 MB or smaller.')
      return
    }
    setFile(picked)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault(); setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === 'submitting') return
    if (!file) { setFileError('Please attach your CV.'); return }

    const form = e.currentTarget
    const fd   = new FormData()
    fd.append('cv', file)
    fd.append('fullName',        (form.elements.namedItem('fullName')        as HTMLInputElement).value)
    fd.append('email',           (form.elements.namedItem('email')           as HTMLInputElement).value)
    fd.append('phone',           (form.elements.namedItem('phone')           as HTMLInputElement).value || '')
    fd.append('linkedinUrl',     (form.elements.namedItem('linkedinUrl')     as HTMLInputElement).value || '')
    fd.append('yearsExperience', (form.elements.namedItem('yearsExperience') as HTMLInputElement).value)
    fd.append('hp_website',      (form.elements.namedItem('hp_website')      as HTMLInputElement).value || '')
    fd.append('consent', 'true')

    if (TURNSTILE_SITE_KEY) {
      const tk = (form.elements.namedItem('cf-turnstile-response') as HTMLInputElement | null)?.value
      if (!tk) { setStatus('error'); setErrorMsg('Please complete the verification checkbox.'); return }
      fd.append('cf_turnstile_response', tk)
    }

    const answers = questions.map(q => ({
      q: q.text,
      a: (form.elements.namedItem(`answer_${q.id}`) as HTMLTextAreaElement | null)?.value || '',
    }))
    fd.append('screeningAnswers', JSON.stringify(answers))

    setStatus('submitting'); setErrorMsg('')

    try {
      const res = await fetch(`${API_BASE}/api/v1/public/jobs/${encodeURIComponent(token)}/apply`, {
        method: 'POST',
        body: fd,
      })
      if (res.status === 409) {
        setStatus('duplicate')
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErrorMsg(j?.error?.message || 'Something went wrong. Please try again.')
        setStatus('error')
        return
      }
      setStatus('success')
    } catch (err: any) {
      setErrorMsg('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  if (status === 'success') return <SuccessCard jobTitle={jobTitle} />
  if (status === 'duplicate') return <DuplicateCard />

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
        noValidate
      >
        <h2 className="text-lg font-semibold text-[#0D1B2A] mb-6">Apply for this role</h2>

        {/* Honeypot — hidden off-screen. Real users never see/touch this. */}
        <input
          type="text"
          name="hp_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute opacity-0 pointer-events-none"
          style={{ left: '-9999px', position: 'absolute' }}
          defaultValue=""
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full name" required>
            <input
              name="fullName"
              type="text"
              required
              maxLength={200}
              className="input"
            />
          </Field>
          <Field label="Email" required>
            <input
              name="email"
              type="email"
              required
              maxLength={320}
              className="input"
            />
          </Field>
          <Field label="Phone (optional)">
            <input name="phone" type="tel" maxLength={30} className="input" placeholder="+971 50 …" />
          </Field>
          <Field label="LinkedIn (optional)">
            <input name="linkedinUrl" type="url" maxLength={500} className="input" placeholder="https://linkedin.com/in/…" />
          </Field>
          <Field label="Years of experience" required>
            <input
              name="yearsExperience"
              type="number"
              min={0}
              max={60}
              required
              className="input"
            />
          </Field>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">CV (PDF, DOC, DOCX, max 5MB) <span className="text-red-500">*</span></label>
          <label
            htmlFor="cv-input"
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              dragActive ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
          >
            <input
              ref={inputRef}
              id="cv-input"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])}
            />
            {file ? (
              <div>
                <p className="text-sm font-medium text-[#0D1B2A]">📄 {file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB · click to change</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-700">Drag & drop your CV here, or <span className="text-[#C9A84C] font-medium">browse</span></p>
                <p className="text-xs text-gray-500 mt-1">PDF, DOC, or DOCX · up to 5MB</p>
              </div>
            )}
          </label>
          {fileError && <p className="text-xs text-red-600 mt-2">{fileError}</p>}
        </div>

        {questions.length > 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm font-semibold text-[#0D1B2A]">A few questions from the recruiter</p>
            {questions.map(q => (
              <Field key={q.id} label={q.text}>
                <textarea
                  name={`answer_${q.id}`}
                  rows={3}
                  maxLength={2000}
                  className="input"
                />
              </Field>
            ))}
          </div>
        )}

        {TURNSTILE_SITE_KEY && (
          <div
            className="cf-turnstile mt-6"
            data-sitekey={TURNSTILE_SITE_KEY}
          />
        )}

        <label className="flex items-start gap-2 mt-6 text-sm text-gray-700">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>
            I consent to my information being processed for this application in accordance with
            applicable data-protection laws.
          </span>
        </label>

        {status === 'error' && (
          <p className="mt-4 text-sm text-red-600">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="mt-6 w-full bg-[#C9A84C] hover:bg-[#b8973f] disabled:bg-gray-300 text-[#0D1B2A] font-semibold rounded-lg py-3 transition"
        >
          {status === 'submitting' ? 'Submitting…' : 'Submit application'}
        </button>
      </form>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          background-color: white;
          color: #0D1B2A;
        }
        :global(.input:focus) {
          outline: none;
          border-color: #C9A84C;
          box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.15);
        }
      `}</style>
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}

function SuccessCard({ jobTitle }: { jobTitle: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="text-xl font-semibold text-[#0D1B2A] mb-2">Thanks — your application has been received</h2>
      <p className="text-sm text-gray-600">
        We've received your application for <span className="font-medium">{jobTitle}</span>. The
        recruiter will be in touch if you're a fit. You can close this page.
      </p>
    </div>
  )
}

function DuplicateCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
      <div className="text-5xl mb-4">📌</div>
      <h2 className="text-xl font-semibold text-[#0D1B2A] mb-2">You've already applied</h2>
      <p className="text-sm text-gray-600">
        Our records show you've already submitted an application for this role. The recruiter
        will reach out if there's a fit — no need to apply again.
      </p>
    </div>
  )
}
