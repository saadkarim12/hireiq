'use client'
// src/app/(dashboard)/jobs/new/page.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '@/api/jobs'
import apiClient from '@/api/client'
import { TopBar } from '@/components/layout/TopBar'
import { TagInput } from '@/components/ui/TagInput'
import { ScreeningQuestionEditor } from '@/components/jobs/ScreeningQuestionEditor'
import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/solid'
import type { CreateJobForm, ScreeningQuestion } from '@/types'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const jobSchema = z.object({
  title: z.string().min(3, 'Job title is required'),
  hiringCompany: z.string().min(2, 'Company name is required'),
  locationCountry: z.string().min(2, 'Country is required'),
  locationCity: z.string().min(2, 'City is required'),
  jobType: z.enum(['onsite', 'hybrid', 'remote']),
  salaryMin: z.number().min(1000, 'Minimum salary required'),
  salaryMax: z.number().min(1000, 'Maximum salary required'),
  currency: z.enum(['AED', 'SAR', 'USD']),
  requiredSkills: z.array(z.string()).min(1, 'At least one required skill'),
  preferredSkills: z.array(z.string()),
  minExperienceYears: z.number().min(0).max(30),
  requiredLanguages: z.array(z.string()).min(1, 'At least one language required'),
  jdText: z.string().min(100, 'Job description must be at least 100 characters'),
  employmentType: z.enum(['permanent', 'contract', 'temporary']),
  visaRequirement: z.enum(['any', 'residence_visa', 'citizen_only', 'gcc_national', 'own_visa']),
  nationalityPreference: z.enum(['any', 'arab_national', 'western', 'asian', 'local_only']),
})

type FormData = z.infer<typeof jobSchema>

const STEPS = ['Job Details', 'Job Description', 'Screening Questions']

export default function NewJobPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([])
  const [isExtractingCriteria, setIsExtractingCriteria] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      currency: 'AED',
      jobType: 'onsite',
      employmentType: 'permanent',
      visaRequirement: 'any',
      nationalityPreference: 'any',
      requiredSkills: [],
      preferredSkills: [],
      requiredLanguages: [],
      minExperienceYears: 2,
    },
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form
  const currency = watch('currency')
  const locationCountry = watch('locationCountry')
  const jdText = watch('jdText')

  // Auto-set currency from country
  const CITIES: Record<string, string[]> = {
    AE: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Al Ain', 'Other'],
    SA: ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Khobar', 'Dhahran', 'Tabuk', 'Abha', 'NEOM', 'Other'],
    BH: ['Manama', 'Riffa', 'Muharraq', 'Hamad Town', 'Other'],
    KW: ['Kuwait City', 'Salmiya', 'Hawalli', 'Farwaniya', 'Other'],
    QA: ['Doha', 'Al Wakrah', 'Al Khor', 'Lusail', 'Other'],
    OM: ['Muscat', 'Salalah', 'Sohar', 'Nizwa', 'Other'],
  }

  const [showCustomCity, setShowCustomCity] = useState(false)

  const onCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const country = e.target.value
    setValue('locationCountry', country)
    setValue('locationCity', '')
    setShowCustomCity(false)
    const currencyMap: Record<string, string> = {
      AE: 'AED', SA: 'SAR', BH: 'BHD', KW: 'KWD', QA: 'QAR', OM: 'OMR'
    }
    if (currencyMap[country]) setValue('currency', currencyMap[country] as any)
  }

  const onCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'Other') {
      setShowCustomCity(true)
      setValue('locationCity', '')
    } else {
      setShowCustomCity(false)
      setValue('locationCity', e.target.value)
    }
  }

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: (data: CreateJobForm) => jobsApi.create(data),
    onSuccess: async (job) => {
      setCreatedJobId(job.id)
      setIsExtractingCriteria(true)
      // Poll for AI questions — they arrive async from AI Engine
      let questions = job.screeningQuestions || []
      if (questions.length === 0) {
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 3000))
          try {
            const res = await fetch(`http://localhost:3001/api/v1/jobs/${job.id}`, {
              headers: { Authorization: `Bearer ${(apiClient.defaults.headers.common?.Authorization as string) || ''}` }
            })
            const data = await res.json()
            if (data.data?.screeningQuestions?.length > 0) {
              questions = data.data.screeningQuestions
              break
            }
          } catch {}
        }
      }
      setQuestions(questions)
      setIsExtractingCriteria(false)
      setStep(2)
    },
    onError: () => {
      toast.error('Failed to create job. Please try again.')
      setIsExtractingCriteria(false)
    },
  })

  // Activate job mutation
  const activateJobMutation = useMutation({
    mutationFn: (id: string) => jobsApi.activate(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Job is now live! Share the apply link.')
      router.push(`/jobs/${job.id}/pipeline`)
    },
    onError: () => toast.error('Failed to activate job.'),
  })

  const onStep1Next = () => {
    form.trigger(['title', 'hiringCompany', 'locationCountry', 'locationCity', 'jobType', 'salaryMin', 'salaryMax', 'requiredSkills', 'minExperienceYears', 'requiredLanguages'])
      .then((valid) => { if (valid) setStep(1) })
  }

  const onStep2Next = handleSubmit((data) => {
    setIsExtractingCriteria(true)
    createJobMutation.mutate(data as CreateJobForm)
  })

  const onActivate = () => {
    if (!createdJobId) return
    activateJobMutation.mutate(createdJobId)
  }

  return (
    <>
      <TopBar title="Post New Job" subtitle="Fill in the details to start screening candidates" />
      <div className="p-6 max-w-3xl mx-auto">

        {/* Progress Steps */}
        <div className="flex items-center mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={clsx(
                  'w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all',
                  i < step ? 'bg-brand-gold text-brand-navy' :
                  i === step ? 'bg-brand-navy text-white ring-4 ring-brand-navy/20' :
                  'bg-gray-200 text-gray-400'
                )}>
                  {i < step ? <CheckCircleIcon className="w-5 h-5" /> : i + 1}
                </div>
                <span className={clsx(
                  'text-xs font-medium mt-1.5 whitespace-nowrap',
                  i === step ? 'text-brand-navy' : 'text-gray-400'
                )}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={clsx('flex-1 h-0.5 mx-3 mb-5 transition-colors', i < step ? 'bg-brand-gold' : 'bg-gray-200')} />
              )}
            </div>
          ))}
        </div>

        <div className="card rounded-xl overflow-hidden">
          {/* ─── STEP 1: Job Details ─── */}
          {step === 0 && (
            <div className="p-6 space-y-5">
              <h2 className="text-lg font-bold text-brand-navy">Job Details</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label label-required">Job Title</label>
                  <input {...register('title')} className="input" placeholder="e.g. Senior Financial Analyst" />
                  {errors.title && <p className="error-text">{errors.title.message}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="label label-required">Hiring Company</label>
                  <input {...register('hiringCompany')} className="input" placeholder="e.g. DAMAC Properties" />
                  {errors.hiringCompany && <p className="error-text">{errors.hiringCompany.message}</p>}
                </div>

                <div>
                  <label className="label label-required">Country</label>
                  <select
                    {...register('locationCountry')}
                    onChange={onCountryChange}
                    className="input"
                  >
                    <option value="">Select country</option>
                    <option value="AE">🇦🇪 United Arab Emirates</option>
                    <option value="SA">🇸🇦 Saudi Arabia</option>
                    <option value="BH">🇧🇭 Bahrain</option>
                    <option value="KW">🇰🇼 Kuwait</option>
                    <option value="QA">🇶🇦 Qatar</option>
                    <option value="OM">🇴🇲 Oman</option>
                  </select>
                  {errors.locationCountry && <p className="error-text">{errors.locationCountry.message}</p>}
                </div>

                <div>
                  <label className="label label-required">City</label>
                  {locationCountry && CITIES[locationCountry] ? (
                    <>
                      <select
                        onChange={onCityChange}
                        className="input"
                        defaultValue=""
                      >
                        <option value="" disabled>Select city</option>
                        {CITIES[locationCountry].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {showCustomCity && (
                        <input
                          {...register('locationCity')}
                          className="input mt-2"
                          placeholder="Enter city name"
                          autoFocus
                        />
                      )}
                    </>
                  ) : (
                    <input {...register('locationCity')} className="input" placeholder="e.g. Dubai" />
                  )}
                  {errors.locationCity && <p className="error-text">{errors.locationCity.message}</p>}
                </div>

                <div>
                  <label className="label label-required">Job Type</label>
                  <div className="flex gap-2">
                    {(['onsite', 'hybrid', 'remote'] as const).map((type) => (
                      <label key={type} className="flex-1">
                        <input type="radio" {...register('jobType')} value={type} className="sr-only peer" />
                        <div className="text-center py-2 px-3 border-2 rounded-lg text-sm font-medium cursor-pointer transition-all
                          border-gray-200 text-gray-500
                          peer-checked:border-brand-blue peer-checked:bg-brand-blue/5 peer-checked:text-brand-blue capitalize">
                          {type}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label label-required">Employment Type</label>
                  <div className="flex gap-2">
                    {(['permanent', 'contract', 'temporary'] as const).map((type) => (
                      <label key={type} className="flex-1">
                        <input type="radio" {...register('employmentType')} value={type} className="sr-only peer" />
                        <div className="text-center py-2 px-3 border-2 rounded-lg text-sm font-medium cursor-pointer transition-all border-gray-200 text-gray-500 peer-checked:border-brand-navy peer-checked:bg-brand-navy/5 peer-checked:text-brand-navy capitalize">
                          {type}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label label-required">Min Experience</label>
                  <div className="flex items-center gap-2">
                    <input type="number" {...register('minExperienceYears', { valueAsNumber: true })} className="input w-20" min={0} max={30} />
                    <span className="text-sm text-gray-500">years</span>
                  </div>
                </div>

                <div>
                  <label className="label label-required">Currency</label>
                  <select {...register('currency')} className="input">
                    <optgroup label="GCC Currencies">
                      <option value="AED">🇦🇪 AED — UAE Dirham</option>
                      <option value="SAR">🇸🇦 SAR — Saudi Riyal</option>
                      <option value="BHD">🇧🇭 BHD — Bahraini Dinar</option>
                      <option value="KWD">🇰🇼 KWD — Kuwaiti Dinar</option>
                      <option value="QAR">🇶🇦 QAR — Qatari Riyal</option>
                      <option value="OMR">🇴🇲 OMR — Omani Rial</option>
                    </optgroup>
                    <optgroup label="International">
                      <option value="USD">🇺🇸 USD — US Dollar</option>
                      <option value="GBP">🇬🇧 GBP — British Pound</option>
                    </optgroup>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="label label-required">Salary Range ({currency})</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <input type="number" {...register('salaryMin', { valueAsNumber: true })} className="input" placeholder="Min e.g. 15000" />
                      {errors.salaryMin && <p className="error-text">{errors.salaryMin.message}</p>}
                    </div>
                    <span className="text-gray-400 font-medium">—</span>
                    <div className="flex-1">
                      <input type="number" {...register('salaryMax', { valueAsNumber: true })} className="input" placeholder="Max e.g. 25000" />
                      {errors.salaryMax && <p className="error-text">{errors.salaryMax.message}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="label label-required">Required Skills</label>
                <TagInput
                  value={watch('requiredSkills')}
                  onChange={(tags) => setValue('requiredSkills', tags)}
                  placeholder="Type a skill and press Enter (e.g. IFRS, SAP, Excel)"
                  max={10}
                />
                {errors.requiredSkills && <p className="error-text">At least one required skill</p>}
              </div>

              <div>
                <label className="label">Preferred Skills <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                <TagInput
                  value={watch('preferredSkills')}
                  onChange={(tags) => setValue('preferredSkills', tags)}
                  placeholder="Nice-to-have skills"
                  max={8}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label label-required">Visa / Residency Requirement</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    { value: 'any', label: '🌍 Open to all visas' },
                    { value: 'residence_visa', label: '📋 Must have residence visa' },
                    { value: 'own_visa', label: '🔖 Must have own visa / transferable' },
                    { value: 'gcc_national', label: '🏴 GCC Nationals preferred' },
                    { value: 'citizen_only', label: '🇦🇪 Citizens only (Emiratization/Saudization)' },
                  ] as const).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
                      <input type="radio" {...register('visaRequirement')} value={opt.value} className="w-4 h-4 text-brand-navy" />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="label">Nationality Preference <span className="text-gray-400 font-normal text-xs">(optional — leave as Any if open)</span></label>
                <select {...register('nationalityPreference')} className="input">
                  <option value="any">🌍 Any nationality welcome</option>
                  <option value="arab_national">🌙 Arab nationals preferred</option>
                  <option value="gcc_national">🏴 GCC nationals preferred</option>
                  <option value="local_only">🇦🇪 Local nationals only (Emiratization / Saudization)</option>
                  <option value="western">Western nationals preferred</option>
                  <option value="asian">Asian nationals preferred</option>
                </select>
              </div>

              <div>
                <label className="label label-required">Languages Required</label>
                <div className="flex gap-3">
                  {[
                    { value: 'English', label: 'English' },
                    { value: 'Arabic', label: 'Arabic' },
                  ].map((lang) => (
                    <label key={lang.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        value={lang.value}
                        checked={watch('requiredLanguages')?.includes(lang.value)}
                        onChange={(e) => {
                          const current = watch('requiredLanguages') || []
                          setValue('requiredLanguages',
                            e.target.checked
                              ? [...current, lang.value]
                              : current.filter(l => l !== lang.value)
                          )
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                      />
                      <span className="text-sm font-medium text-gray-700">{lang.label}</span>
                    </label>
                  ))}
                </div>
                {errors.requiredLanguages && <p className="error-text">Select at least one language</p>}
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={onStep1Next} className="btn-primary">
                  Next: Job Description →
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 2: Job Description ─── */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              <h2 className="text-lg font-bold text-brand-navy">Job Description</h2>
              <p className="text-sm text-gray-500">Paste your job description or type it below. AI will extract screening criteria automatically.</p>

              <div>
                <label className="label label-required">
                  Job Description
                  <span className="ml-2 text-xs font-normal text-gray-400">({jdText?.length || 0} chars — min 100)</span>
                </label>
                <textarea
                  {...register('jdText')}
                  rows={14}
                  className="input resize-none font-mono text-sm"
                  placeholder="Paste or type your complete job description here..."
                />
                {errors.jdText && <p className="error-text">{errors.jdText.message}</p>}
              </div>

              {isExtractingCriteria && (
                <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-lg p-4 flex items-center gap-3">
                  <SparklesIcon className="w-5 h-5 text-brand-blue animate-pulse flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-brand-navy">AI is analysing your job description...</p>
                    <p className="text-xs text-gray-500 mt-0.5">Extracting requirements and generating screening questions</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep(0)} className="btn-secondary">
                  ← Back
                </button>
                <button
                  onClick={onStep2Next}
                  disabled={isExtractingCriteria || createJobMutation.isPending}
                  className="btn-primary"
                >
                  {isExtractingCriteria ? 'AI Processing...' : 'Generate Questions →'}
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Screening Questions ─── */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-brand-navy">Screening Questions</h2>
                <span className="bg-brand-gold/20 text-brand-gold-dark text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <SparklesIcon className="w-3 h-3" /> AI Generated
                </span>
              </div>
              <p className="text-sm text-gray-500">
                These questions will be sent to every candidate via WhatsApp. Edit, reorder, or add your own.
              </p>

              <ScreeningQuestionEditor
                questions={questions}
                onChange={setQuestions}
              />

              <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-lg p-4">
                <p className="text-xs font-semibold text-brand-navy mb-1">What happens when you activate:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✅ A unique Apply link is generated for sharing</li>
                  <li>✅ Candidates who click Apply will start WhatsApp screening automatically</li>
                  <li>✅ You will be notified when the AI shortlist is ready</li>
                  <li>✅ All applications screened with zero manual effort</li>
                </ul>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep(1)} className="btn-secondary">
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  <button className="btn-secondary text-sm">
                    Save as Draft
                  </button>
                  <button
                    onClick={onActivate}
                    disabled={activateJobMutation.isPending || questions.length < 3}
                    className="btn-gold"
                  >
                    {activateJobMutation.isPending ? 'Activating...' : '🚀 Activate Job'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
