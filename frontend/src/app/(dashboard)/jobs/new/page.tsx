'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { api } from '@/api/client'
import {
  COUNTRIES, CITIES_BY_COUNTRY, COUNTRY_TO_CURRENCY,
  WORK_MODES, EMPLOYMENT_TYPES,
  VISA_REQUIREMENTS, NATIONALITY_PREFS, IMMEDIATE_JOIN_OPTIONS,
  GCC_CURRENCIES, INTL_CURRENCIES,
  AI_RECOMMENDATION_BANDS,
  QUESTION_CATEGORY_LABELS, QUESTION_CATEGORY_BADGE, type QuestionCategory,
  BRAND, JD_BUILDER_QUESTIONS,
} from '@/lib/constants'

// ── SCHEMA ────────────────────────────────────────────────────────────────────
const schema = z.object({
  title:                z.string().min(2, 'Required'),
  hiringCompany:        z.string().min(2, 'Required'),
  locationCountry:      z.string().min(2, 'Required'),
  locationCity:         z.string().min(2, 'Required'),
  customCity:           z.string().optional(),
  employmentType:       z.enum(['permanent','contract','temporary']),
  jobType:              z.enum(['onsite','hybrid','remote']),
  currency:             z.enum(['AED','SAR','BHD','KWD','QAR','OMR','USD','GBP']),
  salaryMin:            z.number().min(1, 'Required'),
  salaryMax:            z.number().min(1, 'Required'),
  visaRequirement:      z.enum(['any','residence_visa','own_visa','gcc_national','citizen_only']),
  nationalityPref:      z.enum(['any','arab_national','gcc_national','local_only']),
  immediateJoin:        z.enum(['any','immediate','30d','60d']),
  minExperienceYears:   z.number().min(0),
  requiredLanguages:    z.array(z.string()).min(1),
  requiredSkills:       z.array(z.string()).min(1, 'Add at least one required skill'),
  preferredSkills:      z.array(z.string()),
  // Step 2
  jdMode:               z.enum(['builder','paste']),
  jdQ1: z.string().optional(), jdQ2: z.string().optional(), jdQ3: z.string().optional(),
  jdQ4: z.string().optional(), jdQ5: z.string().optional(),
  jdText:               z.string().optional(),
  generatedJdEn:        z.string().optional(),
  generatedJdAr:        z.string().optional(),
  // Step 3
  mustHaveSkills:       z.array(z.string()),
  niceToHaveSkills:     z.array(z.string()),
  // Step 4 — AI-generated baseline questions. `category` is the new field
  // that classifies each question into Background Validation / Commitment /
  // Salary. Backend ai-service guarantees coverage of all three.
  screeningQuestions:   z.array(z.object({
    id:             z.string(),
    questionTextEn: z.string(),
    questionTextAr: z.string().optional(),
    type:           z.string(),
    category:       z.enum(['background_validation','commitment','salary']).optional(),
    rationale:      z.string().optional(),
  })),
  // Per-field "Ask AI to verify in screening" flags. These do NOT create hard
  // filters — only Min Experience + Required Skills are hard filters, and they
  // are always on. Toggling a field here tells the AI to generate a baseline
  // WhatsApp screening question that probes it.
  aiVerifyFields: z.object({
    minSalary:     z.boolean(),
    languages:     z.boolean(),
    visa:          z.boolean(),
    nationality:   z.boolean(),
    immediateJoin: z.boolean(),
  }),
})

type FormData = z.infer<typeof schema>

// ── AI VERIFY TOGGLE ──────────────────────────────────────────────────────────
function AiVerifyToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none"
      title="When checked, the AI will generate a baseline WhatsApp screening question that probes this field">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded"
        style={{ accentColor: BRAND.GOLD }}
      />
      <span className="font-medium" style={{ color: checked ? BRAND.GOLD : '#9CA3AF' }}>
        {checked ? '✨ AI will probe this' : 'Ask AI to verify'}
      </span>
    </label>
  )
}

// ── STEP INDICATOR ────────────────────────────────────────────────────────────
function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ['Role Basics','JD Builder','AI Screening Criteria','Baseline Questions']
  return (
    <div className="flex items-center justify-center mb-8">
      {labels.map((label, i) => {
        const n = i + 1
        const done = n < step
        const active = n === step
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                done   ? 'text-white' :
                active ? 'text-white' :
                'bg-gray-100 text-gray-400'
              }`} style={done ? {background: BRAND.GOLD} : active ? {background: BRAND.GREEN_DARK} : {}}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs mt-1 font-medium ${active ? 'text-gray-800' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < total - 1 && (
              <div className={`w-16 h-0.5 mx-2 mb-5 transition-all ${done ? '' : 'bg-gray-200'}`}
                style={done ? {background: BRAND.GOLD} : {}} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── AI-DRIVEN BADGE ───────────────────────────────────────────────────────────
function AiDrivenBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: BRAND.GOLD_BG, color: BRAND.GOLD_FG }}
      title="Every job in HireIQ is screened by AI. Recruiters always make the final advancement decision.">
      ✨ AI-driven screening
    </span>
  )
}

// ── TAG INPUT ─────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder, color }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string; color?: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) { onChange([...tags, v]); setInput('') }
  }
  return (
    <div className="border border-gray-200 rounded-xl p-2 flex flex-wrap gap-1.5 focus-within:border-emerald-400 transition-colors min-h-[44px]">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
          style={{ background: color || BRAND.GREEN_LIGHT, color: BRAND.GREEN_DARK }}>
          {tag}
          <button onClick={() => onChange(tags.filter(t => t !== tag))} className="ml-0.5 opacity-60 hover:opacity-100 text-xs">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : 'Add more...'}
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent py-1 px-1"
      />
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function NewJobPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isGeneratingJd, setIsGeneratingJd] = useState(false)
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCustomCity, setShowCustomCity] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ existing?: { title: string; hiringCompany: string; createdAt: string } } | null>(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  const { register, watch, setValue, getValues, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      locationCountry: 'AE', currency: 'AED', employmentType: 'permanent',
      jobType: 'onsite', visaRequirement: 'any', nationalityPref: 'any',
      immediateJoin: 'any',
      minExperienceYears: 3, salaryMin: 0, salaryMax: 0,
      requiredLanguages: ['English'], requiredSkills: [], preferredSkills: [],
      mustHaveSkills: [], niceToHaveSkills: [],
      jdMode: 'paste', screeningQuestions: [],
      aiVerifyFields: {
        minSalary:     false,
        languages:     false,
        visa:          false,
        nationality:   false,
        immediateJoin: false,
      },
    },
  })

  const vals = watch()

  const onCountryChange = (country: string) => {
    setValue('locationCountry', country)
    setValue('locationCity', '')
    setShowCustomCity(false)
    if (COUNTRY_TO_CURRENCY[country]) setValue('currency', COUNTRY_TO_CURRENCY[country] as any)
  }

  // Map aiVerifyFields object → array of keys for backend prompt
  const computeAiMandatoryFields = (v: FormData): string[] =>
    Object.entries(v.aiVerifyFields || {}).filter(([, on]) => on).map(([k]) => k)

  // ── STEP 2: Generate JD from builder questions ────────────────────────────
  const generateJd = async () => {
    const { jdQ1, jdQ2, jdQ3, jdQ4, jdQ5, title, hiringCompany, locationCountry, requiredSkills } = getValues()
    if (!jdQ1 || !jdQ2) { toast.error('Please answer at least Questions 1 and 2'); return }
    setIsGeneratingJd(true)
    try {
      const res = await fetch('http://localhost:3002/api/v1/ai/generate-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, hiringCompany, locationCountry, requiredSkills, jdQ1, jdQ2, jdQ3, jdQ4, jdQ5 }),
      })
      const data = await res.json()
      if (data.success) {
        setValue('generatedJdEn', data.data.jdEn)
        setValue('generatedJdAr', data.data.jdAr)
        setValue('jdText', data.data.jdEn)
        toast.success('JD generated!')
      } else {
        const fallback = `${title} at ${hiringCompany}\n\nRole Overview:\n${jdQ1}\n\nRequired Experience:\n${jdQ2}${jdQ3 ? '\n\nSuccess in 6 months:\n' + jdQ3 : ''}${jdQ4 ? '\n\nTeam Culture:\n' + jdQ4 : ''}${jdQ5 ? '\n\nIndustry Background:\n' + jdQ5 : ''}\n\nRequired Skills: ${requiredSkills?.join(', ')}`
        setValue('generatedJdEn', fallback)
        setValue('jdText', fallback)
        toast.success('JD drafted from your answers')
      }
    } catch {
      const { jdQ1, jdQ2, jdQ3, jdQ4, jdQ5, title, hiringCompany, requiredSkills } = getValues()
      const fallback = `${title} at ${hiringCompany}\n\nRole Overview:\n${jdQ1}\n\nRequired Experience:\n${jdQ2}${jdQ3 ? '\n\nSuccess in 6 months:\n' + jdQ3 : ''}${jdQ4 ? '\n\nTeam & Culture:\n' + jdQ4 : ''}${jdQ5 ? '\n\nIndustry:\n' + jdQ5 : ''}\n\nRequired Skills: ${requiredSkills?.join(', ')}`
      setValue('generatedJdEn', fallback)
      setValue('jdText', fallback)
      toast.success('JD drafted from your answers')
    } finally {
      setIsGeneratingJd(false)
    }
  }

  // ── STEP 3 → 4: Create job + generate questions ───────────────────────────
  const createJobAndGenerateQuestions = async () => {
    const v = getValues()
    const jdText = v.jdText || v.generatedJdEn || ''
    if (!jdText || jdText.length < 50) { toast.error('Please complete the JD first'); return }

    setIsGeneratingQuestions(true)
    try {
      const aiMandatoryFields = computeAiMandatoryFields(v)

      const jobRes = await api.post<any>('/jobs', {
        title: v.title, hiringCompany: v.hiringCompany,
        locationCountry: v.locationCountry, locationCity: v.customCity || v.locationCity,
        employmentType: v.employmentType, jobType: v.jobType,
        currency: v.currency, salaryMin: v.salaryMin, salaryMax: v.salaryMax,
        visaRequirement: v.visaRequirement, nationalityPref: v.nationalityPref,
        immediateJoin: v.immediateJoin,
        minExperienceYears: v.minExperienceYears, requiredLanguages: v.requiredLanguages,
        requiredSkills: v.requiredSkills, preferredSkills: v.preferredSkills,
        mustHaveSkills: v.mustHaveSkills, niceToHaveSkills: v.niceToHaveSkills,
        // Tells backend's process-jd to generate baseline questions covering
        // these recruiter-flagged fields, in addition to the three mandatory
        // categories (background_validation, commitment, salary).
        aiMandatoryFields,
        jdText,
        allowDuplicate,
      })

      const jobId = jobRes.data.data.id
      setCreatedJobId(jobId)

      const questions = jobRes.data.data.screeningQuestions || []
      if (questions.length === 0) {
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 3500))
          try {
            const pollRes = await api.get<any>(`/jobs/${jobId}`)
            const q = pollRes.data.data.screeningQuestions || []
            if (q.length > 0) { setValue('screeningQuestions', q); break }
          } catch {}
        }
      } else {
        setValue('screeningQuestions', questions)
      }

      setStep(4)
    } catch (err: any) {
      const backendMsg = err?.response?.data?.error?.message
      toast.error(backendMsg
        ? `Couldn't create job — ${backendMsg}`
        : 'Failed to create job. Check that backend is running.')
      console.error(err)
    } finally {
      setIsGeneratingQuestions(false)
    }
  }

  // ── STEP 4: Activate job ──────────────────────────────────────────────────
  const activateJob = async () => {
    if (!createdJobId) return
    setIsSubmitting(true)
    try {
      await api.post(`/jobs/${createdJobId}/activate`, {})
      toast.success('Job activated! Apply link is ready.')
      router.push(`/jobs/${createdJobId}/pipeline`)
    } catch {
      toast.error('Activation failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveAsDraft = () => {
    if (createdJobId) { toast.success('Saved as draft'); router.push('/jobs') }
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 transition-colors bg-white"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1.5"

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: ROLE BASICS
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 1) return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{color: BRAND.GREEN_DARK}}>Post New Job</h1>
          <AiDrivenBadge />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Fill in the details. Tick <span className="font-medium" style={{color: BRAND.GOLD}}>✨ AI will probe this</span> on any field you want the AI to ask the candidate about during WhatsApp screening. <span className="font-medium">Min Experience and Required Skills are always enforced as hard filters</span> — no toggle needed.
        </p>
      </div>
      <StepIndicator step={1} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-8 space-y-6">
        <h2 className="text-lg font-semibold" style={{color: BRAND.GREEN_DARK}}>Role Basics</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Job Title *</label>
            <input {...register('title', {
              onBlur: async () => {
                const t = getValues('title'); const c = getValues('hiringCompany')
                if (!t || !c) return
                try {
                  const res = await api.get<{ duplicate: boolean; existing: any }>(`/jobs/check-duplicate?title=${encodeURIComponent(t)}&hiringCompany=${encodeURIComponent(c)}`)
                  if ((res.data as any)?.data?.duplicate) {
                    setDuplicateWarning({ existing: (res.data as any).data.existing })
                    setAllowDuplicate(false)
                  } else {
                    setDuplicateWarning(null)
                  }
                } catch {}
              }
            })} className={inputCls} placeholder="e.g. Senior Finance Analyst" />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Hiring Company *</label>
            <input {...register('hiringCompany', {
              onBlur: async () => {
                const t = getValues('title'); const c = getValues('hiringCompany')
                if (!t || !c) return
                try {
                  const res = await api.get<{ duplicate: boolean; existing: any }>(`/jobs/check-duplicate?title=${encodeURIComponent(t)}&hiringCompany=${encodeURIComponent(c)}`)
                  if ((res.data as any)?.data?.duplicate) {
                    setDuplicateWarning({ existing: (res.data as any).data.existing })
                    setAllowDuplicate(false)
                  } else {
                    setDuplicateWarning(null)
                  }
                } catch {}
              }
            })} className={inputCls} placeholder="e.g. DAMAC Properties" />
          </div>
        </div>

        {duplicateWarning?.existing && (
          <div className="rounded-xl p-3 text-sm flex items-start gap-3"
            style={{ background: '#FEF3C7', borderLeft: '4px solid ' + BRAND.GOLD }}>
            <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-medium" style={{ color: '#92400E' }}>
                An active &lsquo;{duplicateWarning.existing.title}&rsquo; at {duplicateWarning.existing.hiringCompany} already exists.
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Make sure this is a distinct role before continuing. Created on {new Date(duplicateWarning.existing.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}.
              </p>
              <label className="flex items-center gap-1.5 mt-2 text-xs text-amber-900 cursor-pointer">
                <input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />
                I understand this is a new, distinct role — continue anyway
              </label>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Country *</label>
            <select value={vals.locationCountry} onChange={e => onCountryChange(e.target.value)} className={inputCls}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>City *</label>
            {CITIES_BY_COUNTRY[vals.locationCountry] ? (
              <>
                <select value={showCustomCity ? 'Other' : vals.locationCity}
                  onChange={e => { if (e.target.value === 'Other') { setShowCustomCity(true); setValue('locationCity','Other') } else { setShowCustomCity(false); setValue('locationCity', e.target.value) } }}
                  className={inputCls}>
                  <option value="">Select city</option>
                  {CITIES_BY_COUNTRY[vals.locationCountry].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {showCustomCity && (
                  <input {...register('customCity')} className={inputCls + ' mt-2'} placeholder="Enter city name" autoFocus />
                )}
              </>
            ) : (
              <input {...register('locationCity')} className={inputCls} placeholder="City" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>Employment Type *</label>
            <div className="flex gap-1.5">
              {EMPLOYMENT_TYPES.map(t => (
                <label key={t} className="flex-1 cursor-pointer">
                  <input type="radio" {...register('employmentType')} value={t} className="sr-only" />
                  <div className={`text-center py-2 text-xs font-medium rounded-lg border-2 transition-all capitalize ${
                    vals.employmentType === t ? 'border-emerald-600 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`} style={vals.employmentType === t ? {background: BRAND.GREEN_DARK} : {}}>
                    {t}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Work Mode *</label>
            <div className="flex gap-1.5">
              {WORK_MODES.map(t => (
                <label key={t} className="flex-1 cursor-pointer">
                  <input type="radio" {...register('jobType')} value={t} className="sr-only" />
                  <div className={`text-center py-2 text-xs font-medium rounded-lg border-2 transition-all capitalize ${
                    vals.jobType === t ? 'border-emerald-600 text-white' : 'border-gray-200 text-gray-500'
                  }`} style={vals.jobType === t ? {background: BRAND.GREEN_DARK} : {}}>
                    {t}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">
                Min Experience (years) *
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background: BRAND.GOLD_BG, color: BRAND.GOLD_FG}}>HARD FILTER</span>
              </label>
            </div>
            <input type="number" {...register('minExperienceYears', {valueAsNumber:true})} min={0} max={30} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select {...register('currency')} className={inputCls}>
              <optgroup label="GCC">
                {GCC_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </optgroup>
              <optgroup label="International">
                {INTL_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Min Salary ({vals.currency}) <span className="text-gray-400 font-normal text-xs">per month</span></label>
              <AiVerifyToggle
                checked={vals.aiVerifyFields?.minSalary}
                onChange={v => setValue('aiVerifyFields.minSalary', v)} />
            </div>
            <input type="number" {...register('salaryMin', {valueAsNumber:true})} className={inputCls} placeholder="e.g. 15,000" />
          </div>
          <div>
            <label className={labelCls}>Max Salary ({vals.currency}) <span className="text-gray-400 font-normal text-xs">per month</span></label>
            <input type="number" {...register('salaryMax', {valueAsNumber:true})} className={inputCls} placeholder="e.g. 25,000" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Immediate Join</label>
              <AiVerifyToggle
                checked={vals.aiVerifyFields?.immediateJoin}
                onChange={v => setValue('aiVerifyFields.immediateJoin', v)} />
            </div>
            <select {...register('immediateJoin')} className={inputCls}>
              {Object.values(IMMEDIATE_JOIN_OPTIONS).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">When toggled, AI will ask candidates about their notice period during WhatsApp screening.</p>
          </div>
          <div></div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Visa Requirement</label>
              <AiVerifyToggle
                checked={vals.aiVerifyFields?.visa}
                onChange={v => setValue('aiVerifyFields.visa', v)} />
            </div>
            <select {...register('visaRequirement')} className={inputCls}>
              {Object.values(VISA_REQUIREMENTS).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Nationality Preference</label>
              <AiVerifyToggle
                checked={vals.aiVerifyFields?.nationality}
                onChange={v => setValue('aiVerifyFields.nationality', v)} />
            </div>
            <select {...register('nationalityPref')} className={inputCls}>
              {Object.values(NATIONALITY_PREFS).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">Languages Required</label>
            <AiVerifyToggle
              checked={vals.aiVerifyFields?.languages}
              onChange={v => setValue('aiVerifyFields.languages', v)} />
          </div>
          <div className="flex gap-4">
            {['English','Arabic'].map(lang => (
              <label key={lang} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox"
                  checked={vals.requiredLanguages?.includes(lang)}
                  onChange={e => {
                    const curr = vals.requiredLanguages || []
                    setValue('requiredLanguages', e.target.checked ? [...curr, lang] : curr.filter(l => l !== lang))
                  }}
                  className="w-4 h-4 rounded" style={{accentColor: BRAND.GREEN_DARK}}
                />
                <span className="text-sm text-gray-700">{lang}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">
              Required Skills *
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background: BRAND.GOLD_BG, color: BRAND.GOLD_FG}}>HARD FILTER</span>
            </label>
          </div>
          <TagInput tags={vals.requiredSkills||[]} onChange={v => setValue('requiredSkills',v)} placeholder="Type a skill and press Enter (e.g. IFRS, SAP, Excel)" />
          {errors.requiredSkills && <p className="text-red-500 text-xs mt-1">Add at least one required skill</p>}
        </div>

        <div>
          <label className={labelCls}>Preferred Skills <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
          <TagInput tags={vals.preferredSkills||[]} onChange={v => setValue('preferredSkills',v)} placeholder="Nice-to-have skills (e.g. Power BI, CFA)" color={BRAND.GOLD_BG} />
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <button onClick={() => {
          const v = getValues()
          if (!v.title || !v.hiringCompany || (!v.locationCity && !v.customCity)) { toast.error('Please fill all required fields'); return }
          if (!v.requiredSkills?.length) { toast.error('Add at least one required skill'); return }
          setStep(2)
        }} className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{background: BRAND.GREEN_DARK}}>
          Next: JD Builder →
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: JD BUILDER
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 2) return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{color: BRAND.GREEN_DARK}}>Post New Job</h1>
          <AiDrivenBadge />
        </div>
        <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
      </div>
      <StepIndicator step={2} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{color: BRAND.GREEN_DARK}}>Job Description</h2>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setValue('jdMode','paste')}
              className={`px-4 py-2 font-medium transition-all ${vals.jdMode === 'paste' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              style={vals.jdMode === 'paste' ? {background: BRAND.GREEN_DARK} : {}}>
              📋 Paste JD
            </button>
            <button onClick={() => setValue('jdMode','builder')}
              className={`px-4 py-2 font-medium transition-all ${vals.jdMode === 'builder' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              style={vals.jdMode === 'builder' ? {background: BRAND.GREEN_DARK} : {}}>
              ✨ AI Builder
            </button>
          </div>
        </div>

        {vals.jdMode === 'builder' ? (
          <div className="space-y-4">
            {!vals.generatedJdEn ? (
              <>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
                  Answer these 5 questions (takes ~3 minutes). AI will write a full bilingual JD from your answers.
                </div>
                {JD_BUILDER_QUESTIONS.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <textarea {...register(key as any)} rows={3}
                      className={inputCls + ' resize-none'} placeholder={placeholder} />
                  </div>
                ))}
                <button onClick={generateJd} disabled={isGeneratingJd}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{background: BRAND.GREEN_DARK}}>
                  {isGeneratingJd ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating JD with AI...</>
                  ) : '✨ Generate JD with AI →'}
                </button>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span className="text-sm text-green-700 font-medium">JD generated. Review and edit below.</span>
                  <button onClick={() => { setValue('generatedJdEn',''); setValue('generatedJdAr',''); setValue('jdText','') }}
                    className="ml-auto text-xs text-green-600 underline">Regenerate</button>
                </div>
                <div>
                  <label className={labelCls}>English JD <span className="text-gray-400 text-xs font-normal">(edit if needed)</span></label>
                  <textarea value={vals.generatedJdEn} onChange={e => { setValue('generatedJdEn', e.target.value); setValue('jdText', e.target.value) }}
                    rows={12} className={inputCls + ' resize-none font-mono text-xs'} />
                </div>
                {vals.generatedJdAr && (
                  <div>
                    <label className={labelCls}>Arabic JD</label>
                    <textarea value={vals.generatedJdAr} onChange={e => setValue('generatedJdAr', e.target.value)}
                      rows={8} className={inputCls + ' resize-none font-mono text-xs'} dir="rtl" />
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div>
            <label className={labelCls}>Paste your existing JD</label>
            <textarea {...register('jdText')} rows={16}
              className={inputCls + ' resize-none'}
              placeholder="Paste the full job description here. AI will extract screening criteria automatically." />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-400">Minimum 100 characters</p>
              <button type="button" onClick={() => setValue('jdMode','builder')}
                className="text-xs font-medium hover:underline" style={{color: BRAND.GREEN_DARK}}>
                Don&apos;t have a JD yet? Use AI Builder →
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-5">
        <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
          ← Back
        </button>
        <button onClick={() => {
          const jd = vals.jdText || vals.generatedJdEn || ''
          if (jd.length < 50) { toast.error('Please complete the JD first'); return }
          setValue('jdText', jd)
          setStep(3)
        }} className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{background: BRAND.GREEN_DARK}}>
          Next: AI Screening Criteria →
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: AI SCREENING CRITERIA — locked hard filters + AI-verify summary
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 3) {
    const aiVerifyRows: { key: string; title: string; value: any }[] = []
    if (vals.aiVerifyFields?.minSalary) aiVerifyRows.push({
      key: 'minSalary', title: 'Min Salary',
      value: `${vals.salaryMin?.toLocaleString()} ${vals.currency} / month`,
    })
    if (vals.aiVerifyFields?.languages) aiVerifyRows.push({
      key: 'languages', title: 'Languages',
      value: (vals.requiredLanguages || []).join(' + '),
    })
    if (vals.aiVerifyFields?.visa) aiVerifyRows.push({
      key: 'visa', title: 'Visa requirement',
      value: VISA_REQUIREMENTS[vals.visaRequirement]?.label,
    })
    if (vals.aiVerifyFields?.nationality) aiVerifyRows.push({
      key: 'nationality', title: 'Nationality preference',
      value: NATIONALITY_PREFS[vals.nationalityPref]?.label,
    })
    if (vals.aiVerifyFields?.immediateJoin) aiVerifyRows.push({
      key: 'immediateJoin', title: 'Immediate join',
      value: IMMEDIATE_JOIN_OPTIONS[vals.immediateJoin]?.label,
    })

    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{color: BRAND.GREEN_DARK}}>Post New Job</h1>
            <AiDrivenBadge />
          </div>
          <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
        </div>
        <StepIndicator step={3} total={4} />

        <div className="bg-white border border-gray-200 rounded-2xl p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold" style={{color: BRAND.GREEN_DARK}}>AI Screening Criteria</h2>
            <p className="text-sm text-gray-500 mt-1">
              Two locked hard filters apply to every CV. Anything else flagged in Step 1 becomes a WhatsApp screening question, not a filter.
            </p>
          </div>

          {/* Locked hard filters — Experience + Required Skills only */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2" style={{background:"#F9FAFB"}}>
              <span className="text-sm font-semibold text-gray-700">Hard Filters (always enforced)</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto" style={{background: BRAND.GOLD_BG, color: BRAND.GOLD_FG}}>
                2 active
              </span>
            </div>
            <div className="p-4 space-y-1">
              <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-700">Minimum experience</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background: BRAND.GOLD_BG, color: BRAND.GOLD_FG}}>HARD FILTER</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Candidates below this are rejected before scoring</p>
                </div>
                <div className="flex items-start gap-3 flex-shrink-0">
                  <span className="text-sm font-bold" style={{color: BRAND.GREEN_DARK}}>{vals.minExperienceYears} years</span>
                  <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline whitespace-nowrap">Edit</button>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-700">Required skills</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background: BRAND.GOLD_BG, color: BRAND.GOLD_FG}}>HARD FILTER</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Missing any of these = automatic rejection</p>
                </div>
                <div className="flex items-start gap-3 flex-shrink-0">
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-md">
                    {(vals.requiredSkills || []).map(s => (
                      <span key={s} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:'#FEE2E2',color:'#991B1B'}}>✗ {s}</span>
                    ))}
                  </div>
                  <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline whitespace-nowrap">Edit</button>
                </div>
              </div>
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500" style={{background:'#F9FAFB'}}>
              These are the only hard filters HireIQ applies. To enforce additional traits, set the Hiring Manager&rsquo;s expectations in the JD — the AI uses the JD for soft scoring.
            </div>
          </div>

          {/* AI-verify (drives baseline question generation) */}
          {aiVerifyRows.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2" style={{background:"#F9FAFB"}}>
                <span className="text-sm font-semibold text-gray-700">AI will probe in WhatsApp screening</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto" style={{background: BRAND.GOLD_BG, color: BRAND.GOLD_FG}}>
                  {aiVerifyRows.length} field{aiVerifyRows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="p-4 space-y-1">
                {aiVerifyRows.map((row, i) => (
                  <div key={row.key}
                    className={`flex items-start justify-between gap-4 py-2.5 ${i < aiVerifyRows.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{row.title}</p>
                    </div>
                    <div className="flex items-start gap-3 flex-shrink-0">
                      <span className="text-sm text-gray-700">{row.value}</span>
                      <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline whitespace-nowrap">Edit</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500" style={{background:'#F9FAFB'}}>
                ✨ The AI will generate a baseline question covering each of these in addition to Background Validation, Commitment, and Salary Expectations.
              </div>
            </div>
          )}

          {/* AI Recommendation Bands legend (read-only) */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-700">AI Recommendation Bands</h3>
              <span className="text-xs text-gray-400">how the AI flags candidates for your review</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {AI_RECOMMENDATION_BANDS.map(band => (
                <div key={band.verdict} className="rounded-xl p-4 text-center border-2"
                  style={{background: band.bg, borderColor: band.border}}>
                  <div className="text-xs font-medium mb-2" style={{color: band.fg}}>
                    {band.verdict === 'advance' ? `Score ≥ ${band.min}`
                     : band.verdict === 'hold' ? `Score ${band.min}–74`
                     : `Score < 55`}
                  </div>
                  <div className="text-2xl">{band.emoji}</div>
                  <div className="text-xs font-semibold mt-2" style={{color: band.fg}}>{band.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{band.tagline}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4 text-sm" style={{background: BRAND.GREEN_LIGHT}}>
            <p className="font-medium mb-1" style={{color: BRAND.GREEN_DARK}}>How this works in your hiring:</p>
            <p style={{color:"#0F6E56"}}>These bands are system-wide. AI recommendations are advisory — recruiters make all advancement decisions. You&apos;ll see the AI&apos;s band on every candidate card; you Approve, Hold, or Reject from there.</p>
          </div>
        </div>

        <div className="flex justify-between mt-5">
          <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">← Back</button>
          <button onClick={createJobAndGenerateQuestions} disabled={isGeneratingQuestions}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60" style={{background: BRAND.GREEN_DARK}}>
            {isGeneratingQuestions ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Creating job...</> : "Next: Baseline Questions →"}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: BASELINE QUESTIONS
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{color: BRAND.GREEN_DARK}}>Post New Job</h1>
          <AiDrivenBadge />
        </div>
        <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
      </div>
      <StepIndicator step={4} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-8 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold" style={{color: BRAND.GREEN_DARK}}>Baseline Screening Questions</h2>
            {vals.screeningQuestions?.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background: BRAND.GREEN_LIGHT, color: BRAND.GREEN_DARK}}>
                ✨ AI Generated
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Sent to every candidate via WhatsApp after CV approval. AI guarantees coverage of <span className="font-medium">{Object.values(QUESTION_CATEGORY_LABELS).join(', ')}</span>. Edit or add your own.
          </p>
        </div>

        {vals.screeningQuestions?.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
            <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-2" />
            AI is generating questions from your JD... (up to 30 seconds)
          </div>
        ) : (
          <div className="space-y-3">
            {vals.screeningQuestions?.map((q, i) => {
              const cat = q.category as QuestionCategory | undefined
              const catBadge = cat && QUESTION_CATEGORY_BADGE[cat]
              const catLabel = cat && QUESTION_CATEGORY_LABELS[cat]
              return (
                <div key={q.id || i} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white"
                      style={{background: BRAND.GREEN_DARK}}>{i + 1}</span>
                    {catLabel && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background: catBadge!.bg, color: catBadge!.fg}}>
                        {catLabel}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{q.type}</span>
                    <button onClick={() => setValue('screeningQuestions', vals.screeningQuestions!.filter((_, j) => j !== i))}
                      className="ml-auto text-gray-300 hover:text-red-400 transition-colors text-lg">×</button>
                  </div>
                  <textarea
                    value={q.questionTextEn}
                    onChange={e => {
                      const updated = [...vals.screeningQuestions!]
                      updated[i] = { ...updated[i], questionTextEn: e.target.value }
                      setValue('screeningQuestions', updated)
                    }}
                    rows={2}
                    className="w-full text-sm text-gray-800 bg-transparent resize-none outline-none border-b border-gray-100 focus:border-emerald-300 transition-colors pb-1"
                  />
                  {q.questionTextAr && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Show Arabic version</summary>
                      <p className="text-sm text-gray-600 mt-1.5 p-2 bg-gray-50 rounded text-right" dir="rtl">{q.questionTextAr}</p>
                    </details>
                  )}
                  {q.rationale && <p className="text-xs text-gray-400 mt-1.5 italic">💡 {q.rationale}</p>}
                </div>
              )
            })}
          </div>
        )}

        {vals.screeningQuestions?.length > 0 && (
          <div>
            <button type="button"
              onClick={() => {
                const newQ = {
                  id: `custom-${Date.now()}`,
                  type: 'skill_probe' as const,
                  category: 'background_validation' as const,
                  questionTextEn: '',
                  questionTextAr: '',
                  rationale: 'Custom question added by recruiter',
                }
                setValue('screeningQuestions', [...(vals.screeningQuestions || []), newQ])
              }}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors">
              + Add Custom Question
            </button>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Custom questions are English-only in this release. Candidates on Arabic will receive the English version. Arabic auto-translation coming in Phase 7.
            </p>
          </div>
        )}

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-medium" style={{color: BRAND.GREEN_DARK}}>What happens when you activate:</p>
          {[
            'A unique Apply link is generated for sharing on your website and LinkedIn',
            'Candidates who apply will have their CV screened instantly by AI',
            'Approved candidates start WhatsApp screening automatically',
            'You will be notified when the AI shortlist is ready',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-emerald-700">
              <span className="text-green-500 mt-0.5">✅</span>{item}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between mt-5">
        <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
          ← Back
        </button>
        <div className="flex gap-3">
          <button onClick={saveAsDraft}
            className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
            Save as Draft
          </button>
          <button onClick={activateJob} disabled={isSubmitting || !createdJobId}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-2 disabled:opacity-60"
            style={{background: BRAND.GREEN_DARK}}>
            {isSubmitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Activating...</>
            ) : '🚀 Activate Job'}
          </button>
        </div>
      </div>
    </div>
  )
}
