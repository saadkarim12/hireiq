// frontend/src/app/apply/[token]/page.tsx
// Public, unauthenticated job-application page (v1.12.0).
// Sits OUTSIDE the (dashboard) group so it inherits only the root HTML shell —
// no sidebar, no topbar, no auth checks.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ApplyForm } from './ApplyForm'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type PublicJob = {
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
  requiredLanguages: string[]
  minExperienceYears: number
  jdText: string
  screeningQuestions: Array<{ id?: string; text?: string; q?: string } | string> | null
}

async function fetchJob(token: string): Promise<PublicJob | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/jobs/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data as PublicJob) ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const job = await fetchJob(params.token)
  if (!job) return { title: 'Job not available' }
  return {
    title: `${job.title} — ${job.hiringCompany}`,
    description: `Apply for the ${job.title} role at ${job.hiringCompany}.`,
  }
}

export default async function ApplyPage({ params }: { params: { token: string } }) {
  const job = await fetchJob(params.token)
  if (!job) return <LinkClosed />

  // Normalise screeningQuestions into a consistent {id, text} shape regardless
  // of how the AI engine emitted them historically.
  const questions = Array.isArray(job.screeningQuestions)
    ? job.screeningQuestions
        .map((q, i) => {
          if (typeof q === 'string') return { id: `q${i}`, text: q }
          return { id: q.id || `q${i}`, text: q.text || q.q || '' }
        })
        .filter(q => q.text.trim().length > 0)
        .slice(0, 5)
    : []

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-2">
          <span className="text-2xl font-bold text-[#0D1B2A]">HireIQ</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <p className="text-sm font-medium text-[#C9A84C] uppercase tracking-wide mb-1">
            {job.hiringCompany}
          </p>
          <h1 className="text-3xl font-bold text-[#0D1B2A]">{job.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1">
              📍 {job.locationCity}, {job.locationCountry}
            </span>
            <span>·</span>
            <span className="capitalize">{job.jobType}</span>
            {job.minExperienceYears > 0 && (
              <>
                <span>·</span>
                <span>{job.minExperienceYears}+ years</span>
              </>
            )}
            {job.salaryMin > 0 && job.salaryMax > 0 && (
              <>
                <span>·</span>
                <span>{job.currency} {job.salaryMin.toLocaleString()}–{job.salaryMax.toLocaleString()}/mo</span>
              </>
            )}
          </div>

          {(job.requiredSkills?.length || 0) > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Required skills</p>
              <div className="flex flex-wrap gap-2">
                {job.requiredSkills.map(skill => (
                  <span
                    key={skill}
                    className="inline-block bg-[#0D1B2A]/5 text-[#0D1B2A] border border-[#0D1B2A]/20 rounded-full px-3 py-1 text-xs font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          <details className="mt-6 group rounded-xl border border-gray-200 bg-gray-50/40 overflow-hidden transition-colors hover:border-[#C9A84C]/50">
            <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none list-none">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C9A84C]/10 text-[#C9A84C] text-base">
                  📄
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0D1B2A] leading-tight">Role Overview</p>
                  <p className="text-xs text-gray-500 mt-0.5 group-open:hidden">
                    Click to read the full job description
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 hidden group-open:block">
                    Click to collapse
                  </p>
                </div>
              </div>
              <svg
                className="h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-5 pb-5 pt-4 border-t border-gray-200 bg-white prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
              {job.jdText}
            </div>
          </details>
        </section>

        <ApplyForm token={params.token} jobTitle={job.title} questions={questions} />

        <footer className="mt-8 text-center text-xs text-gray-500">
          Your information is shared with {job.hiringCompany} for recruitment purposes only.
        </footer>
      </main>
    </div>
  )
}

function LinkClosed() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-gray-200 p-10">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-semibold text-[#0D1B2A] mb-2">
          This job is no longer accepting applications
        </h1>
        <p className="text-sm text-gray-600">
          The link may have expired or the position has been filled. Please reach out to
          the recruiter directly if you believe this is a mistake.
        </p>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
