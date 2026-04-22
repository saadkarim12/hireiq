'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { api } from '@/api/client'

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
  minExperienceYears:   z.number().min(0),
  requiredLanguages:    z.array(z.string()).min(1),
  requiredSkills:       z.array(z.string()).min(1, 'Add at least one required skill'),
  preferredSkills:      z.array(z.string()),
  // Step 2
  jdMode:               z.enum(['builder','paste']),
  jdQ1:                 z.string().optional(),
  jdQ2:                 z.string().optional(),
  jdQ3:                 z.string().optional(),
  jdQ4:                 z.string().optional(),
  jdQ5:                 z.string().optional(),
  jdText:               z.string().optional(),
  generatedJdEn:        z.string().optional(),
  generatedJdAr:        z.string().optional(),
  // Step 3
  mustHaveSkills:       z.array(z.string()),
  niceToHaveSkills:     z.array(z.string()),
  autoApproveThreshold: z.number().min(1).max(100),
  autoRejectThreshold:  z.number().min(1).max(100),
  // Step 4
  screeningQuestions:   z.array(z.object({
    id: z.string(),
    questionTextEn: z.string(),
    questionTextAr: z.string().optional(),
    type: z.string(),
    rationale: z.string().optional(),
  })),
})

type FormData = z.infer<typeof schema>

const CITIES: Record<string, string[]> = {
  AE: ['Abu Dhabi','Dubai','Sharjah','Ajman','Ras Al Khaimah','Fujairah','Al Ain','Other'],
  SA: ['Riyadh','Jeddah','Mecca','Medina','Dammam','Khobar','Dhahran','Tabuk','Abha','NEOM','Other'],
  BH: ['Manama','Riffa','Muharraq','Hamad Town','Other'],
  KW: ['Kuwait City','Salmiya','Hawalli','Farwaniya','Other'],
  QA: ['Doha','Al Wakrah','Al Khor','Lusail','Other'],
  OM: ['Muscat','Salalah','Sohar','Nizwa','Other'],
}

const CURRENCY_MAP: Record<string,string> = {
  AE:'AED', SA:'SAR', BH:'BHD', KW:'KWD', QA:'QAR', OM:'OMR'
}

const COUNTRIES = [
  { code:'AE', label:'🇦🇪 UAE' },
  { code:'SA', label:'🇸🇦 Saudi Arabia' },
  { code:'BH', label:'🇧🇭 Bahrain' },
  { code:'KW', label:'🇰🇼 Kuwait' },
  { code:'QA', label:'🇶🇦 Qatar' },
  { code:'OM', label:'🇴🇲 Oman' },
  { code:'GB', label:'🇬🇧 UK' },
  { code:'US', label:'🇺🇸 USA' },
]

// ── STEP INDICATOR ────────────────────────────────────────────────────────────
function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ['Role Basics','JD Builder','Screening Criteria','Baseline Questions']
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
              }`} style={done ? {background:'#C9A84C'} : active ? {background:'#0A3D2E'} : {}}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs mt-1 font-medium ${active ? 'text-gray-800' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < total - 1 && (
              <div className={`w-16 h-0.5 mx-2 mb-5 transition-all ${done ? '' : 'bg-gray-200'}`}
                style={done ? {background:'#C9A84C'} : {}} />
            )}
          </div>
        )
      })}
    </div>
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
          style={{ background: color || '#E8F5EE', color: '#0A3D2E' }}>
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

  const { register, watch, setValue, getValues, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      locationCountry: 'AE', currency: 'AED', employmentType: 'permanent',
      jobType: 'onsite', visaRequirement: 'any', nationalityPref: 'any',
      minExperienceYears: 3, salaryMin: 0, salaryMax: 0,
      requiredLanguages: ['English'], requiredSkills: [], preferredSkills: [],
      mustHaveSkills: [], niceToHaveSkills: [],
      autoApproveThreshold: 75, autoRejectThreshold: 40,
      jdMode: 'builder', screeningQuestions: [],
    },
  })

  const vals = watch()

  const onCountryChange = (country: string) => {
    setValue('locationCountry', country)
    setValue('locationCity', '')
    setShowCustomCity(false)
    if (CURRENCY_MAP[country]) setValue('currency', CURRENCY_MAP[country] as any)
  }

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
        // Fallback: compose from answers
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
      // Create job via API
      const token = (document.querySelector('[data-token]') as any)?.dataset?.token
      const headers: any = { 'Content-Type': 'application/json' }

      const jobRes = await api.post<any>('/jobs', {
        title: v.title, hiringCompany: v.hiringCompany,
        locationCountry: v.locationCountry, locationCity: v.customCity || v.locationCity,
        employmentType: v.employmentType, jobType: v.jobType,
        currency: v.currency, salaryMin: v.salaryMin, salaryMax: v.salaryMax,
        visaRequirement: v.visaRequirement, nationalityPref: v.nationalityPref,
        minExperienceYears: v.minExperienceYears, requiredLanguages: v.requiredLanguages,
        requiredSkills: v.requiredSkills, preferredSkills: v.preferredSkills,
        mustHaveSkills: v.mustHaveSkills, niceToHaveSkills: v.niceToHaveSkills,
        autoApproveThreshold: v.autoApproveThreshold, autoRejectThreshold: v.autoRejectThreshold,
        jdText,
      })

      const jobId = jobRes.data.data.id
      setCreatedJobId(jobId)

      // Poll for questions
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
      // Surface the real backend message when present so recruiters can self-serve
      // (e.g. "Argument `salaryMin` is missing"). Generic fallback only for true
      // network failures where there's no response at all.
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:'#0A3D2E'}}>Post New Job</h1>
        <p className="text-gray-500 text-sm mt-1">Fill in the details to start screening candidates</p>
      </div>
      <StepIndicator step={1} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-semibold" style={{color:'#0A3D2E'}}>Role Basics</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Job Title *</label>
            <input {...register('title')} className={inputCls} placeholder="e.g. Senior Finance Analyst" />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Hiring Company *</label>
            <input {...register('hiringCompany')} className={inputCls} placeholder="e.g. DAMAC Properties" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Country *</label>
            <select value={vals.locationCountry} onChange={e => onCountryChange(e.target.value)} className={inputCls}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>City *</label>
            {CITIES[vals.locationCountry] ? (
              <>
                <select value={showCustomCity ? 'Other' : vals.locationCity}
                  onChange={e => { if (e.target.value === 'Other') { setShowCustomCity(true); setValue('locationCity','Other') } else { setShowCustomCity(false); setValue('locationCity', e.target.value) } }}
                  className={inputCls}>
                  <option value="">Select city</option>
                  {CITIES[vals.locationCountry].map(c => <option key={c} value={c}>{c}</option>)}
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

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Employment Type *</label>
            <div className="flex gap-1.5">
              {(['permanent','contract','temporary'] as const).map(t => (
                <label key={t} className="flex-1 cursor-pointer">
                  <input type="radio" {...register('employmentType')} value={t} className="sr-only" />
                  <div className={`text-center py-2 text-xs font-medium rounded-lg border-2 transition-all capitalize ${
                    vals.employmentType === t ? 'border-emerald-600 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`} style={vals.employmentType === t ? {background:'#0A3D2E'} : {}}>
                    {t}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Work Mode *</label>
            <div className="flex gap-1.5">
              {(['onsite','hybrid','remote'] as const).map(t => (
                <label key={t} className="flex-1 cursor-pointer">
                  <input type="radio" {...register('jobType')} value={t} className="sr-only" />
                  <div className={`text-center py-2 text-xs font-medium rounded-lg border-2 transition-all capitalize ${
                    vals.jobType === t ? 'border-emerald-600 text-white' : 'border-gray-200 text-gray-500'
                  }`} style={vals.jobType === t ? {background:'#0A3D2E'} : {}}>
                    {t}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Min Experience (years) *</label>
            <input type="number" {...register('minExperienceYears', {valueAsNumber:true})} min={0} max={30} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Currency</label>
            <select {...register('currency')} className={inputCls}>
              <optgroup label="GCC">
                <option value="AED">🇦🇪 AED</option>
                <option value="SAR">🇸🇦 SAR</option>
                <option value="BHD">🇧🇭 BHD</option>
                <option value="KWD">🇰🇼 KWD</option>
                <option value="QAR">🇶🇦 QAR</option>
                <option value="OMR">🇴🇲 OMR</option>
              </optgroup>
              <optgroup label="International">
                <option value="USD">🇺🇸 USD</option>
                <option value="GBP">🇬🇧 GBP</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className={labelCls}>Min Salary ({vals.currency}) <span className="text-gray-400 font-normal text-xs">per month</span></label>
            <input type="number" {...register('salaryMin', {valueAsNumber:true})} className={inputCls} placeholder="e.g. 15,000" />
          </div>
          <div>
            <label className={labelCls}>Max Salary ({vals.currency}) <span className="text-gray-400 font-normal text-xs">per month</span></label>
            <input type="number" {...register('salaryMax', {valueAsNumber:true})} className={inputCls} placeholder="e.g. 25,000" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Visa Requirement</label>
            <select {...register('visaRequirement')} className={inputCls}>
              <option value="any">🌍 Open to all visas</option>
              <option value="residence_visa">📋 Must have residence visa</option>
              <option value="own_visa">🔖 Own visa / transferable</option>
              <option value="gcc_national">🏴 GCC Nationals preferred</option>
              <option value="citizen_only">🇦🇪 Citizens only (Emiratization/Saudization)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Nationality Preference</label>
            <select {...register('nationalityPref')} className={inputCls}>
              <option value="any">🌍 Any nationality</option>
              <option value="arab_national">🌙 Arab nationals preferred</option>
              <option value="gcc_national">🏴 GCC nationals preferred</option>
              <option value="local_only">🇦🇪 Local nationals only</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Languages Required</label>
          <div className="flex gap-4">
            {['English','Arabic'].map(lang => (
              <label key={lang} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox"
                  checked={vals.requiredLanguages?.includes(lang)}
                  onChange={e => {
                    const curr = vals.requiredLanguages || []
                    setValue('requiredLanguages', e.target.checked ? [...curr, lang] : curr.filter(l => l !== lang))
                  }}
                  className="w-4 h-4 rounded" style={{accentColor:'#0A3D2E'}}
                />
                <span className="text-sm text-gray-700">{lang}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Required Skills *</label>
          <TagInput tags={vals.requiredSkills||[]} onChange={v => setValue('requiredSkills',v)} placeholder="Type a skill and press Enter (e.g. IFRS, SAP, Excel)" />
          {errors.requiredSkills && <p className="text-red-500 text-xs mt-1">Add at least one required skill</p>}
        </div>

        <div>
          <label className={labelCls}>Preferred Skills <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
          <TagInput tags={vals.preferredSkills||[]} onChange={v => setValue('preferredSkills',v)} placeholder="Nice-to-have skills (e.g. Power BI, CFA)" color="#FDF6E3" />
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <button onClick={() => {
          const v = getValues()
          if (!v.title || !v.hiringCompany || !v.locationCity && !v.customCity) { toast.error('Please fill all required fields'); return }
          if (!v.requiredSkills?.length) { toast.error('Add at least one required skill'); return }
          setStep(2)
        }} className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{background:'#0A3D2E'}}>
          Next: JD Builder →
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: JD BUILDER
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 2) return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:'#0A3D2E'}}>Post New Job</h1>
        <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
      </div>
      <StepIndicator step={2} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{color:'#0A3D2E'}}>Job Description</h2>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setValue('jdMode','builder')}
              className={`px-4 py-2 font-medium transition-all ${vals.jdMode === 'builder' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              style={vals.jdMode === 'builder' ? {background:'#0A3D2E'} : {}}>
              ✨ AI Builder
            </button>
            <button onClick={() => setValue('jdMode','paste')}
              className={`px-4 py-2 font-medium transition-all ${vals.jdMode === 'paste' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              style={vals.jdMode === 'paste' ? {background:'#0A3D2E'} : {}}>
              📋 Paste JD
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
                {[
                  { q: 'Q1 — Daily Responsibilities *', placeholder: 'What will this person do every day? e.g. Prepare monthly financial reports, build financial models for project feasibility, liaise with external auditors...', key: 'jdQ1', required: true },
                  { q: 'Q2 — Essential Experience *', placeholder: 'What experience is non-negotiable? e.g. Minimum 5 years in financial analysis, strong IFRS knowledge, previous experience in real estate or construction...', key: 'jdQ2', required: true },
                  { q: 'Q3 — Success in 6 Months', placeholder: 'What does a great hire achieve in their first 6 months? e.g. Owns the monthly close process independently, has built relationships with all department heads...', key: 'jdQ3', required: false },
                  { q: 'Q4 — Team Culture', placeholder: 'Describe the team and working environment. e.g. Small collaborative finance team of 6, fast-paced, direct communication with CFO, hybrid working...', key: 'jdQ4', required: false },
                  { q: 'Q5 — Industry Background', placeholder: 'Any specific industry required? e.g. Must have GCC real estate experience, banking or financial services preferred, open to any industry...', key: 'jdQ5', required: false },
                ].map(({ q, placeholder, key, required }) => (
                  <div key={key}>
                    <label className={labelCls}>{q}</label>
                    <textarea {...register(key as any)} rows={3}
                      className={inputCls + ' resize-none'} placeholder={placeholder} />
                  </div>
                ))}
                <button onClick={generateJd} disabled={isGeneratingJd}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{background:'#0A3D2E'}}>
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
            <p className="text-xs text-gray-400 mt-1">Minimum 100 characters</p>
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
          style={{background:'#0A3D2E'}}>
          Next: Screening Criteria →
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: SCREENING CRITERIA (simplified)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 3) return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:"#0A3D2E"}}>Post New Job</h1>
        <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
      </div>
      <StepIndicator step={3} total={4} />
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold" style={{color:"#0A3D2E"}}>Screening Criteria</h2>
          <p className="text-sm text-gray-500 mt-1">Review your auto-applied filters and set automation thresholds.</p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2" style={{background:"#F9FAFB"}}>
            <span className="text-sm font-semibold text-gray-700">Hard Filters — auto-applied from Step 1</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto" style={{background:"#DCFCE7",color:"#166534"}}>Automatic</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-700">Minimum experience</p>
                <p className="text-xs text-gray-400">Candidates below this are rejected before scoring</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{color:"#0A3D2E"}}>{vals.minExperienceYears} years</span>
                <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline">Edit</button>
              </div>
            </div>
            <div className="py-2 border-b border-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">Required skills</p>
                  <p className="text-xs text-gray-400">Missing any of these = automatic rejection</p>
                </div>
                <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline">Edit</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(vals.requiredSkills||[]).map((s: string) => (
                  <span key={s} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:"#FEE2E2",color:"#991B1B"}}>✗ {s}</span>
                ))}
              </div>
            </div>
            {(vals.preferredSkills||[]).length > 0 && (
              <div className="py-2 border-b border-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Preferred skills</p>
                    <p className="text-xs text-gray-400">Boost score — do not reject</p>
                  </div>
                  <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline">Edit</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(vals.preferredSkills||[]).map((s: string) => (
                    <span key={s} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:"#FEF3C7",color:"#92400E"}}>+ {s}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Visa requirement</p>
                <p className="text-xs text-gray-400">Applied to every applicant</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {vals.visaRequirement === "any" ? "Open to all visas" :
                   vals.visaRequirement === "residence_visa" ? "Must have residence visa" :
                   vals.visaRequirement === "own_visa" ? "Own visa / transferable" :
                   vals.visaRequirement === "gcc_national" ? "GCC Nationals preferred" :
                   "Citizens only"}
                </span>
                <button onClick={() => setStep(1)} className="text-xs text-blue-500 underline">Edit</button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Automation Thresholds</h3>
            <span className="text-xs text-gray-400">click numbers to adjust</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4 text-center border-2" style={{background:"#F0FDF4",borderColor:"#BBF7D0"}}>
              <div className="text-xs font-medium mb-2" style={{color:"#166534"}}>Score ≥</div>
              <input type="number" value={vals.autoApproveThreshold}
                onChange={e => setValue("autoApproveThreshold", Math.max(parseInt(e.target.value)||75, (vals.autoRejectThreshold||40)+1))}
                min={1} max={100} className="w-16 text-center text-2xl font-bold bg-transparent border-b-2 outline-none" style={{color:"#166534",borderColor:"#86EFAC"}} />
              <div className="text-xs font-semibold mt-2" style={{color:"#166534"}}>Auto-approve</div>
              <div className="text-xs text-gray-400 mt-1">WhatsApp immediately</div>
            </div>
            <div className="rounded-xl p-4 text-center border-2" style={{background:"#FFFBEB",borderColor:"#FDE68A"}}>
              <div className="text-xs font-medium mb-2" style={{color:"#92400E"}}>Score</div>
              <div className="text-2xl font-bold" style={{color:"#92400E"}}>{vals.autoRejectThreshold}–{(vals.autoApproveThreshold||75)-1}</div>
              <div className="text-xs font-semibold mt-2" style={{color:"#92400E"}}>Amber Zone</div>
              <div className="text-xs text-gray-400 mt-1">CV Review Dashboard</div>
            </div>
            <div className="rounded-xl p-4 text-center border-2" style={{background:"#FFF1F2",borderColor:"#FECDD3"}}>
              <div className="text-xs font-medium mb-2" style={{color:"#991B1B"}}>Score &lt;</div>
              <input type="number" value={vals.autoRejectThreshold}
                onChange={e => setValue("autoRejectThreshold", Math.min(parseInt(e.target.value)||40, (vals.autoApproveThreshold||75)-1))}
                min={1} max={100} className="w-16 text-center text-2xl font-bold bg-transparent border-b-2 outline-none" style={{color:"#991B1B",borderColor:"#FCA5A5"}} />
              <div className="text-xs font-semibold mt-2" style={{color:"#991B1B"}}>Auto-reject</div>
              <div className="text-xs text-gray-400 mt-1">Rejection email sent</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4 text-sm" style={{background:"#E8F5EE"}}>
          <p className="font-medium mb-1" style={{color:"#0A3D2E"}}>What this means for your hiring:</p>
          <p style={{color:"#0F6E56"}}>Top candidates (≥{vals.autoApproveThreshold}) move to WhatsApp instantly. Borderline candidates ({vals.autoRejectThreshold}–{(vals.autoApproveThreshold||75)-1}) appear in your CV Review Dashboard. Weak candidates (&lt;{vals.autoRejectThreshold}) are handled automatically.</p>
        </div>
      </div>

      <div className="flex justify-between mt-5">
        <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">← Back</button>
        <button onClick={createJobAndGenerateQuestions} disabled={isGeneratingQuestions}
          className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60" style={{background:"#0A3D2E"}}>
          {isGeneratingQuestions ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Creating job...</> : "Next: Baseline Questions →"}
        </button>
      </div>
    </div>
  )

  // STEP 4: BASELINE QUESTIONS
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:'#0A3D2E'}}>Post New Job</h1>
        <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
      </div>
      <StepIndicator step={4} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold" style={{color:'#0A3D2E'}}>Baseline Screening Questions</h2>
            {vals.screeningQuestions?.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:'#E8F5EE', color:'#0A3D2E'}}>
                ✨ AI Generated
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            These questions are sent to every candidate via WhatsApp after CV approval. Edit, reorder, or add your own.
          </p>
        </div>

        {vals.screeningQuestions?.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
            <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-2" />
            AI is generating questions from your JD... (up to 30 seconds)
          </div>
        ) : (
          <div className="space-y-3">
            {vals.screeningQuestions?.map((q, i) => (
              <div key={q.id || i} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white"
                    style={{background:'#0A3D2E'}}>{i + 1}</span>
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
            ))}
          </div>
        )}

        {/* What happens on activate */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-medium" style={{color:'#0A3D2E'}}>What happens when you activate:</p>
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
            style={{background:'#0A3D2E'}}>
            {isSubmitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Activating...</>
            ) : '🚀 Activate Job'}
          </button>
        </div>
      </div>
    </div>
  )
}
