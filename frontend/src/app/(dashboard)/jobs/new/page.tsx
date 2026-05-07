'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { api } from '@/api/client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── SCREENING TYPES ───────────────────────────────────────────────────────────
type FilterType = 'number' | 'text' | 'multi_select' | 'single_select' | 'boolean'
type HardFilter = {
  id: string
  name: string
  type: FilterType
  description: string
  required: boolean
  numberValue?: number
  textValue?: string
  multiValues?: string[]
  singleValue?: string
  singleOptions?: string[]
  booleanValue?: boolean
}
type BandAction = 'advance' | 'hold' | 'reject'
type RecommendationBand = {
  id: string
  label: string
  action: BandAction
  minScore: number
  maxScore: number
  color: 'green' | 'yellow' | 'red' | 'orange'
  icon: string
  description: string
}

const VISA_LABELS: Record<string, string> = {
  any: 'Open to all visas',
  residence_visa: 'Must have residence visa',
  own_visa: 'Own visa / transferable',
  gcc_national: 'GCC Nationals preferred',
  citizen_only: 'Citizens only (Emiratization/Saudization)',
}

const NATIONALITY_LABELS: Record<string, string> = {
  any: 'Any nationality',
  arab_national: 'Arab nationals preferred',
  gcc_national: 'GCC nationals preferred',
  local_only: 'Local nationals only',
}

// Step-1-derived hard filters carry this id prefix so Step 3 can branch
// edit/delete behavior between "redirect to Step 1" and the existing custom
// filter modal. Keep these ids stable — `mandatoryFlags` keys are derived from
// them in the delete handler.
const STEP1_FILTER_PREFIX = 'hf-step1-'
const STEP1_FILTER_IDS = {
  minExperience:   `${STEP1_FILTER_PREFIX}min-experience`,
  minSalary:       `${STEP1_FILTER_PREFIX}min-salary`,
  visaRequirement: `${STEP1_FILTER_PREFIX}visa`,
  nationalityPref: `${STEP1_FILTER_PREFIX}nationality`,
  requiredSkills:  `${STEP1_FILTER_PREFIX}required-skills`,
  joinImmediately: `${STEP1_FILTER_PREFIX}join-immediately`,
} as const

type MandatoryFlagKey = 'minExperience' | 'minSalary' | 'visaRequirement' | 'nationalityPref' | 'requiredSkills'

// Build the read-only Step-1-derived hard filters from current form values.
// Skipped entirely when the corresponding mandatory toggle is off (or, for
// joinImmediately, when the role is "flexible" — flexible means no hard gate).
function deriveStep1Filters(v: any): HardFilter[] {
  const flags = v.mandatoryFlags || {}
  const out: HardFilter[] = []
  if (flags.minExperience) out.push({
    id: STEP1_FILTER_IDS.minExperience,
    name: 'Minimum experience (years)',
    type: 'number',
    description: 'From Role Basics. Candidates below this are rejected before scoring.',
    required: true,
    numberValue: v.minExperienceYears ?? 0,
  })
  if (flags.requiredSkills) out.push({
    id: STEP1_FILTER_IDS.requiredSkills,
    name: 'Required skills',
    type: 'multi_select',
    description: 'From Role Basics. Missing any of these = automatic rejection.',
    required: true,
    multiValues: v.requiredSkills || [],
  })
  if (flags.visaRequirement) out.push({
    id: STEP1_FILTER_IDS.visaRequirement,
    name: 'Visa requirement',
    type: 'single_select',
    description: 'From Role Basics. Applied to every applicant.',
    required: true,
    singleValue: v.visaRequirement || 'any',
    singleOptions: ['any', 'residence_visa', 'own_visa', 'gcc_national', 'citizen_only'],
  })
  if (flags.nationalityPref) out.push({
    id: STEP1_FILTER_IDS.nationalityPref,
    name: 'Nationality preference',
    type: 'single_select',
    description: 'From Role Basics. Candidates outside this preference are rejected.',
    required: true,
    singleValue: v.nationalityPref || 'any',
    singleOptions: ['any', 'arab_national', 'gcc_national', 'local_only'],
  })
  if (flags.minSalary) out.push({
    id: STEP1_FILTER_IDS.minSalary,
    name: 'Minimum salary',
    type: 'number',
    description: `From Role Basics. Candidates expecting below ${v.currency || 'AED'} ${(v.salaryMin ?? 0).toLocaleString()} are rejected.`,
    required: true,
    numberValue: v.salaryMin ?? 0,
  })
  // joinImmediately === 'immediate' is implicitly mandatory — no separate
  // checkbox; "flexible" means the recruiter is open to notice periods.
  if (v.joinImmediately === 'immediate') out.push({
    id: STEP1_FILTER_IDS.joinImmediately,
    name: 'Immediate joining',
    type: 'boolean',
    description: 'From Role Basics. Candidates who cannot join immediately (with notice >30 days) are rejected.',
    required: true,
    booleanValue: true,
  })
  return out
}

const BAND_THEMES: Record<RecommendationBand['color'], { bg: string; border: string; fg: string }> = {
  green:  { bg: '#F0FDF4', border: '#BBF7D0', fg: '#166534' },
  yellow: { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E' },
  orange: { bg: '#FFF7ED', border: '#FED7AA', fg: '#9A3412' },
  red:    { bg: '#FFF1F2', border: '#FECDD3', fg: '#991B1B' },
}

const DEFAULT_BANDS: RecommendationBand[] = [
  { id: 'band-advance', label: 'Score ≥ 75', action: 'advance', minScore: 75, maxScore: 100, color: 'green',  icon: '✅', description: 'Strong match for this role' },
  { id: 'band-hold',    label: 'Score 55–74', action: 'hold',    minScore: 55, maxScore: 74,  color: 'yellow', icon: '⚠️',  description: 'Borderline — review carefully' },
  { id: 'band-reject',  label: 'Score < 55',  action: 'reject',  minScore: 0,  maxScore: 54,  color: 'red',    icon: '❌', description: 'Weak match for this role' },
]

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
  joinImmediately:      z.enum(['immediate','flexible']),
  minExperienceYears:   z.number().min(0),
  requiredLanguages:    z.array(z.string()).min(1),
  requiredSkills:       z.array(z.string()).min(1, 'Add at least one required skill'),
  preferredSkills:      z.array(z.string()),
  // "Mark as Mandatory" toggles — when true, the corresponding Step 1 field is
  // promoted to a hard filter and passed to the AI as a gating criterion.
  mandatoryFlags:       z.object({
    minExperience:    z.boolean(),
    minSalary:        z.boolean(),
    visaRequirement:  z.boolean(),
    nationalityPref:  z.boolean(),
    requiredSkills:   z.boolean(),
  }),
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
  hardFilters:          z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['number','text','multi_select','single_select','boolean']),
    description: z.string(),
    required: z.boolean(),
    numberValue: z.number().optional(),
    textValue: z.string().optional(),
    multiValues: z.array(z.string()).optional(),
    singleValue: z.string().optional(),
    singleOptions: z.array(z.string()).optional(),
    booleanValue: z.boolean().optional(),
  })),
  recommendationBands:  z.array(z.object({
    id: z.string(),
    label: z.string(),
    action: z.enum(['advance','hold','reject']),
    minScore: z.number().min(0).max(100),
    maxScore: z.number().min(0).max(100),
    color: z.enum(['green','yellow','orange','red']),
    icon: z.string(),
    description: z.string(),
  })),
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
]

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

// ── MARK AS MANDATORY CHECKBOX ────────────────────────────────────────────────
// Inline toggle that promotes a Step-1 field to a hard filter. Renders next to
// the field label so the recruiter can decide field-by-field. Tooltip explains
// the AI gating implication.
function MandatoryToggle({ checked, onChange, fieldName }: {
  checked: boolean; onChange: (v: boolean) => void; fieldName: string
}) {
  return (
    <label
      className="inline-flex items-center gap-1 cursor-pointer text-[11px] font-medium select-none px-2 py-0.5 rounded-md transition-colors"
      style={{
        background: checked ? '#FEE2E2' : '#F3F4F6',
        color:      checked ? '#991B1B' : '#6B7280',
      }}
      title={checked
        ? `${fieldName} is a hard filter — candidates who fail are rejected before AI scoring.`
        : `Mark as mandatory to make ${fieldName} a hard filter for AI screening.`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-3 h-3"
        style={{ accentColor: '#991B1B' }}
      />
      <span>{checked ? '🔒 Mandatory' : 'Mark as Mandatory'}</span>
    </label>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function NewJobPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const draftId = searchParams?.get('draftId') || null
  const [step, setStep] = useState(1)
  const [isGeneratingJd, setIsGeneratingJd] = useState(false)
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCustomCity, setShowCustomCity] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(draftId)
  const [isLoadingDraft, setIsLoadingDraft] = useState(!!draftId)
  // 4.3.c — duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState<{ existing?: { title: string; hiringCompany: string; createdAt: string } } | null>(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  const { register, watch, setValue, getValues, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      locationCountry: 'AE', currency: 'AED', employmentType: 'permanent',
      jobType: 'onsite', visaRequirement: 'any', nationalityPref: 'any',
      joinImmediately: 'flexible',
      minExperienceYears: 3, salaryMin: 0, salaryMax: 0,
      requiredLanguages: ['English'], requiredSkills: [], preferredSkills: [],
      mustHaveSkills: [], niceToHaveSkills: [],
      jdMode: 'paste', screeningQuestions: [],
      hardFilters: [],
      recommendationBands: DEFAULT_BANDS,
      mandatoryFlags: {
        minExperience: false, minSalary: false, visaRequirement: false,
        nationalityPref: false, requiredSkills: false,
      },
    },
  })

  const vals = watch()

  // ── DRAFT RESUME — load job & seed form when ?draftId=... is present ──────
  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<any>(`/jobs/${draftId}`)
        const j = res.data.data
        if (cancelled) return
        if (j.status !== 'draft') {
          toast.error('Only draft jobs can be edited. This job is ' + j.status + '.')
          router.push('/jobs')
          return
        }
        const userCriteria = (j.extractedCriteria as any)?.userScreeningCriteria || {}
        reset({
          ...getValues(),
          title:                j.title || '',
          hiringCompany:        j.hiringCompany || '',
          locationCountry:      j.locationCountry || 'AE',
          locationCity:         j.locationCity || '',
          jobType:              j.jobType || 'onsite',
          currency:             j.currency || 'AED',
          salaryMin:            j.salaryMin ?? 0,
          salaryMax:            j.salaryMax ?? 0,
          minExperienceYears:   j.minExperienceYears ?? 0,
          requiredLanguages:    j.requiredLanguages?.length ? j.requiredLanguages : ['English'],
          requiredSkills:       j.requiredSkills || [],
          preferredSkills:      j.preferredSkills || [],
          visaRequirement:      userCriteria.visaRequirement || 'any',
          nationalityPref:      userCriteria.nationalityPref || 'any',
          joinImmediately:      userCriteria.joinImmediately || 'flexible',
          mandatoryFlags:       userCriteria.mandatoryFlags || {
            minExperience: false, minSalary: false, visaRequirement: false,
            nationalityPref: false, requiredSkills: false,
          },
          hardFilters:          Array.isArray(userCriteria.customHardFilters) ? userCriteria.customHardFilters : [],
          jdText:               j.jdText || '',
          generatedJdEn:        j.jdText || '',
          jdMode:               'paste',
          screeningQuestions:   Array.isArray(j.screeningQuestions) ? j.screeningQuestions : [],
        } as any)
        setCreatedJobId(j.id)
        setIsLoadingDraft(false)
        toast.success('Resumed draft — pick up where you left off')
      } catch (err: any) {
        toast.error(err?.response?.data?.error?.message || 'Failed to load draft')
        router.push('/jobs')
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId])

  // ── STEP 3 — Screening criteria UI state ──────────────────────────────────
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null)
  const [bandsEditMode, setBandsEditMode] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Hard filters in form state (`hardFilters`) hold only CUSTOM filters added
  // via the modal. Step-1-derived filters are computed live from the values +
  // `mandatoryFlags` so toggling a checkbox in Step 1 immediately reflects in
  // Step 3 (and re-editing a Step-1 value updates the filter without manual
  // re-seeding). See `deriveStep1Filters` below.

  const setMandatoryFlag = (key: MandatoryFlagKey, checked: boolean) => {
    const current = getValues('mandatoryFlags') || {
      minExperience: false, minSalary: false, visaRequirement: false,
      nationalityPref: false, requiredSkills: false,
    }
    setValue('mandatoryFlags', { ...current, [key]: checked }, { shouldDirty: true })
  }

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
      // Merge Step-1-derived hard filters with any custom ones for the backend
      // payload. Step-1 ones aren't kept in form state (they're derived live)
      // so we recompute them here at submit time.
      const step1Filters = deriveStep1Filters(v)
      const customFilters = v.hardFilters || []
      const allHardFilters = [...step1Filters, ...customFilters]

      const payload = {
        title: v.title, hiringCompany: v.hiringCompany,
        locationCountry: v.locationCountry, locationCity: v.customCity || v.locationCity,
        employmentType: v.employmentType, jobType: v.jobType,
        currency: v.currency, salaryMin: v.salaryMin, salaryMax: v.salaryMax,
        visaRequirement: v.visaRequirement, nationalityPref: v.nationalityPref,
        joinImmediately: v.joinImmediately,
        minExperienceYears: v.minExperienceYears, requiredLanguages: v.requiredLanguages,
        requiredSkills: v.requiredSkills, preferredSkills: v.preferredSkills,
        mustHaveSkills: v.mustHaveSkills, niceToHaveSkills: v.niceToHaveSkills,
        // Recruiter-defined hard filters — persisted under
        // extractedCriteria.userScreeningCriteria server-side and passed to the
        // AI on every CV scoring call as gating criteria.
        mandatoryFlags: v.mandatoryFlags,
        hardFilters: allHardFilters,
        customHardFilters: customFilters,
        jdText,
        allowDuplicate,
      }

      // Resuming an existing draft? PATCH instead of POST.
      const jobRes = createdJobId
        ? await api.patch<any>(`/jobs/${createdJobId}`, payload)
        : await api.post<any>('/jobs', payload)

      const jobId = jobRes.data.data.id
      setCreatedJobId(jobId)

      // Poll briefly for questions if they aren't on the create/patch response.
      // 5×2s = 10s ceiling — enough for Claude to land via the side-effect path,
      // but short enough that a stuck/failed AI call doesn't hold the recruiter.
      // If still empty after polling, advance to Step 4 anyway with a toast — the
      // UI supports manually authoring questions.
      const questions = jobRes.data.data.screeningQuestions || []
      let finalQuestions = questions
      if (questions.length === 0) {
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 2000))
          try {
            const pollRes = await api.get<any>(`/jobs/${jobId}`)
            const q = pollRes.data.data.screeningQuestions || []
            if (q.length > 0) { finalQuestions = q; break }
          } catch {}
        }
      }
      setValue('screeningQuestions', finalQuestions)
      if (finalQuestions.length === 0) {
        toast.error("AI couldn't generate questions — add them manually below.")
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
    <div className="max-w-4xl mx-auto">
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

        {/* 4.3.c — Duplicate warning banner */}
        {duplicateWarning?.existing && (
          <div className="rounded-xl p-3 text-sm flex items-start gap-3"
            style={{ background: '#FEF3C7', borderLeft: '4px solid #C9A84C' }}>
            <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-medium" style={{ color: '#92400E' }}>
                An active '{duplicateWarning.existing.title}' at {duplicateWarning.existing.hiringCompany} already exists.
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

        <div className="grid grid-cols-2 gap-4">
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Min Experience (years) *</label>
            <MandatoryToggle
              checked={!!vals.mandatoryFlags?.minExperience}
              onChange={v => setMandatoryFlag('minExperience', v)}
              fieldName="Minimum experience"
            />
          </div>
          <input type="number" {...register('minExperienceYears', {valueAsNumber:true})} min={0} max={30} className={inputCls} />
        </div>

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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Min Salary ({vals.currency}) <span className="text-gray-400 font-normal text-xs">per month</span>
              </label>
              <MandatoryToggle
                checked={!!vals.mandatoryFlags?.minSalary}
                onChange={v => setMandatoryFlag('minSalary', v)}
                fieldName="Minimum salary"
              />
            </div>
            <input type="number" {...register('salaryMin', {valueAsNumber:true})} className={inputCls} placeholder="e.g. 15,000" />
          </div>

          <div>
            <label className={labelCls}>Max Salary ({vals.currency}) <span className="text-gray-400 font-normal text-xs">per month</span></label>
            <input type="number" {...register('salaryMax', {valueAsNumber:true})} className={inputCls} placeholder="e.g. 25,000" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Visa Requirement</label>
              <MandatoryToggle
                checked={!!vals.mandatoryFlags?.visaRequirement}
                onChange={v => setMandatoryFlag('visaRequirement', v)}
                fieldName="Visa requirement"
              />
            </div>
            <select {...register('visaRequirement')} className={inputCls}>
              <option value="any">🌍 Open to all visas</option>
              <option value="residence_visa">📋 Must have residence visa</option>
              <option value="own_visa">🔖 Own visa / transferable</option>
              <option value="gcc_national">🏴 GCC Nationals preferred</option>
              <option value="citizen_only">🇦🇪 Citizens only (Emiratization/Saudization)</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Nationality Preference</label>
              <MandatoryToggle
                checked={!!vals.mandatoryFlags?.nationalityPref}
                onChange={v => setMandatoryFlag('nationalityPref', v)}
                fieldName="Nationality preference"
              />
            </div>
            <select {...register('nationalityPref')} className={inputCls}>
              <option value="any">🌍 Any nationality</option>
              <option value="arab_national">🌙 Arab nationals preferred</option>
              <option value="gcc_national">🏴 GCC nationals preferred</option>
              <option value="local_only">🇦🇪 Local nationals only</option>
            </select>
          </div>
        </div>

        {/* Joining timeline — when 'immediate', acts as an implicit hard filter */}
        <div>
          <label className={labelCls}>Joining Timeline</label>
          <div className="flex gap-2">
            {([
              { v: 'immediate', label: '⚡ Must join immediately', hint: 'Hard filter — rejects candidates with notice >30 days' },
              { v: 'flexible',  label: '🗓️ Flexible start date',    hint: 'Open to candidates with notice periods' },
            ] as const).map(opt => (
              <label key={opt.v} className="flex-1 cursor-pointer">
                <input type="radio" {...register('joinImmediately')} value={opt.v} className="sr-only" />
                <div className={`text-center py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all ${
                  vals.joinImmediately === opt.v ? 'border-emerald-600 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`} style={vals.joinImmediately === opt.v ? {background:'#0A3D2E'} : {}}>
                  <div>{opt.label}</div>
                  <div className={`text-[10px] mt-0.5 font-normal ${vals.joinImmediately === opt.v ? 'opacity-80' : 'opacity-60'}`}>{opt.hint}</div>
                </div>
              </label>
            ))}
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Required Skills *</label>
            <MandatoryToggle
              checked={!!vals.mandatoryFlags?.requiredSkills}
              onChange={v => setMandatoryFlag('requiredSkills', v)}
              fieldName="Required skills"
            />
          </div>
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:'#0A3D2E'}}>Post New Job</h1>
        <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
      </div>
      <StepIndicator step={2} total={4} />

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{color:'#0A3D2E'}}>Job Description</h2>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setValue('jdMode','paste')}
              className={`px-4 py-2 font-medium transition-all ${vals.jdMode === 'paste' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              style={vals.jdMode === 'paste' ? {background:'#0A3D2E'} : {}}>
              📋 Paste JD
            </button>
            <button onClick={() => setValue('jdMode','builder')}
              className={`px-4 py-2 font-medium transition-all ${vals.jdMode === 'builder' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              style={vals.jdMode === 'builder' ? {background:'#0A3D2E'} : {}}>
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
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-400">Minimum 100 characters</p>
              <button type="button" onClick={() => setValue('jdMode','builder')}
                className="text-xs font-medium hover:underline" style={{color:'#0A3D2E'}}>
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
          style={{background:'#0A3D2E'}}>
          Next: AI Screening Criteria →
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: SCREENING CRITERIA (dynamic filters + editable bands)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 3) {
    // Form's `hardFilters` only holds CUSTOM filters added via the modal.
    // Step-1-derived filters are computed from values + mandatoryFlags so they
    // stay in sync without manual seeding.
    const customFilters: HardFilter[] = vals.hardFilters || []
    const step1Filters: HardFilter[] = deriveStep1Filters(vals)
    const filters: HardFilter[] = [...step1Filters, ...customFilters]
    const bands: RecommendationBand[] = vals.recommendationBands || DEFAULT_BANDS

    const bandErrors = validateBands(bands)
    const filtersValid = filters.length > 0
    const stepValid = filtersValid && bandErrors.length === 0

    const isStep1Filter = (id: string) => id.startsWith(STEP1_FILTER_PREFIX)

    const updateFilter = (next: HardFilter) => {
      // Step-1 filters are read-only here; they're owned by Step 1 form fields.
      if (isStep1Filter(next.id)) return
      const list = [...customFilters]
      const idx = list.findIndex(f => f.id === next.id)
      if (idx >= 0) list[idx] = next; else list.push(next)
      setValue('hardFilters', list, { shouldDirty: true })
    }

    const removeFilter = (id: string) => {
      // Per spec: deleting a Step-1-derived filter unmarks the corresponding
      // mandatory toggle on Step 1 (the field stays in the form, just no longer
      // a hard filter). Custom filters get removed outright.
      if (isStep1Filter(id)) {
        if (!confirm('Remove this hard filter? The field stays on Step 1; it just won\'t be a mandatory gate for AI screening.')) return
        if (id === STEP1_FILTER_IDS.joinImmediately) {
          setValue('joinImmediately', 'flexible', { shouldDirty: true })
          return
        }
        const flagByFilterId: Record<string, MandatoryFlagKey> = {
          [STEP1_FILTER_IDS.minExperience]:   'minExperience',
          [STEP1_FILTER_IDS.minSalary]:       'minSalary',
          [STEP1_FILTER_IDS.visaRequirement]: 'visaRequirement',
          [STEP1_FILTER_IDS.nationalityPref]: 'nationalityPref',
          [STEP1_FILTER_IDS.requiredSkills]:  'requiredSkills',
        }
        const key = flagByFilterId[id]
        if (key) setMandatoryFlag(key, false)
        return
      }
      if (!confirm('Remove this filter?')) return
      setValue('hardFilters', customFilters.filter(f => f.id !== id), { shouldDirty: true })
    }

    const onEditFilter = (id: string) => {
      // Step-1 filters can only be edited at their source (Step 1).
      if (isStep1Filter(id)) {
        toast('Edit this in Role Basics — its value lives on Step 1.', { icon: 'ℹ️' })
        setStep(1)
        return
      }
      setEditingFilterId(id)
      setFilterModalOpen(true)
    }

    const onDragEnd = (e: DragEndEvent) => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      // Only custom filters are reorderable; Step-1 filters are always shown
      // first and locked in their derived order.
      if (isStep1Filter(String(active.id)) || isStep1Filter(String(over.id))) return
      const oldIdx = customFilters.findIndex(f => f.id === active.id)
      const newIdx = customFilters.findIndex(f => f.id === over.id)
      if (oldIdx < 0 || newIdx < 0) return
      setValue('hardFilters', arrayMove(customFilters, oldIdx, newIdx), { shouldDirty: true })
    }

    const editingFilter = editingFilterId ? customFilters.find(f => f.id === editingFilterId) : undefined

    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{color:"#0A3D2E"}}>Post New Job</h1>
          <p className="text-gray-500 text-sm mt-1">{vals.title} at {vals.hiringCompany}</p>
        </div>
        <StepIndicator step={3} total={4} />
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold" style={{color:"#0A3D2E"}}>AI Screening Criteria</h2>
            <p className="text-sm text-gray-500 mt-1">
              Hard filters seeded from Role Basics are shown below. Edit jumps back to Step 1; Delete unmarks the field as mandatory.
              Add custom filters for criteria that don&apos;t live in Role Basics.
            </p>
          </div>

          {/* HARD FILTERS — dynamic list */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2" style={{background:"#F9FAFB"}}>
              <span className="text-sm font-semibold text-gray-700">Hard Filters</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto" style={{background:"#DCFCE7",color:"#166534"}}>Automatic</span>
            </div>
            <div className="p-4 space-y-2">
              {filters.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  No hard filters yet. Mark fields as <span className="font-medium">🔒 Mandatory</span> on Step 1, or use &quot;Add Filter&quot; below.
                </p>
              ) : (
                <>
                  {/* Step-1-derived filters — read-only, no drag handle */}
                  {step1Filters.map(f => (
                    <Step1FilterRow
                      key={f.id}
                      filter={f}
                      onEdit={() => onEditFilter(f.id)}
                      onDelete={() => removeFilter(f.id)}
                    />
                  ))}
                  {/* Custom filters — draggable */}
                  {customFilters.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={customFilters.map(f => f.id)} strategy={verticalListSortingStrategy}>
                        {customFilters.map(f => (
                          <SortableFilterRow
                            key={f.id}
                            filter={f}
                            onEdit={() => onEditFilter(f.id)}
                            onDelete={() => removeFilter(f.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </>
              )}
              <button type="button"
                onClick={() => { setEditingFilterId(null); setFilterModalOpen(true) }}
                className="w-full mt-2 border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors">
                + Add Filter
              </button>
              {!filtersValid && (
                <p className="text-xs text-red-500 mt-1">At least one filter is required.</p>
              )}
            </div>
          </div>

          {/* AI RECOMMENDATION BANDS — editable */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-700">AI Recommendation Bands</h3>
              <span className="text-xs text-gray-400">how the AI flags candidates for your review</span>
              <button type="button"
                onClick={() => setBandsEditMode(m => !m)}
                className="ml-auto text-xs font-medium hover:underline" style={{color:"#0A3D2E"}}>
                {bandsEditMode ? 'Done' : 'Edit thresholds'}
              </button>
            </div>

            <div className={`grid gap-3 ${bands.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {bands.map((b, i) => {
                const theme = BAND_THEMES[b.color]
                if (bandsEditMode) {
                  return (
                    <div key={b.id} className="rounded-xl p-3 border-2" style={{background:theme.bg,borderColor:theme.border}}>
                      <div className="flex items-center justify-between mb-2">
                        <select
                          value={b.action}
                          onChange={e => {
                            const action = e.target.value as BandAction
                            const colorMap: Record<BandAction, RecommendationBand['color']> = { advance:'green', hold:'yellow', reject:'red' }
                            const iconMap: Record<BandAction, string> = { advance:'✅', hold:'⚠️', reject:'❌' }
                            const next = [...bands]
                            next[i] = { ...b, action, color: colorMap[action], icon: iconMap[action] }
                            setValue('recommendationBands', next, { shouldDirty: true })
                          }}
                          className="text-xs font-semibold bg-transparent outline-none" style={{color:theme.fg}}>
                          <option value="advance">Advance</option>
                          <option value="hold">Hold</option>
                          <option value="reject">Reject</option>
                        </select>
                        {bands.length > 2 && (
                          <button type="button"
                            onClick={() => setValue('recommendationBands', bands.filter(x => x.id !== b.id), { shouldDirty: true })}
                            className="text-xs text-gray-400 hover:text-red-500">×</button>
                        )}
                      </div>
                      <div className="text-2xl text-center mb-2">{b.icon}</div>
                      <div className="flex items-center gap-1 justify-center">
                        <input type="number" min={0} max={100} value={b.minScore}
                          onChange={e => {
                            const next = [...bands]
                            next[i] = { ...b, minScore: Number(e.target.value) }
                            setValue('recommendationBands', next, { shouldDirty: true })
                          }}
                          className="w-14 text-xs px-1.5 py-1 rounded border border-gray-200 outline-none focus:border-emerald-400" />
                        <span className="text-xs text-gray-400">–</span>
                        <input type="number" min={0} max={100} value={b.maxScore}
                          onChange={e => {
                            const next = [...bands]
                            next[i] = { ...b, maxScore: Number(e.target.value) }
                            setValue('recommendationBands', next, { shouldDirty: true })
                          }}
                          className="w-14 text-xs px-1.5 py-1 rounded border border-gray-200 outline-none focus:border-emerald-400" />
                      </div>
                      <input
                        value={b.description}
                        onChange={e => {
                          const next = [...bands]
                          next[i] = { ...b, description: e.target.value }
                          setValue('recommendationBands', next, { shouldDirty: true })
                        }}
                        className="w-full mt-2 text-xs px-1.5 py-1 rounded border border-gray-200 outline-none focus:border-emerald-400 bg-white/60" />
                    </div>
                  )
                }
                return (
                  <div key={b.id} className="rounded-xl p-4 text-center border-2" style={{background:theme.bg,borderColor:theme.border}}>
                    <div className="text-xs font-medium mb-2" style={{color:theme.fg}}>{formatBandLabel(b)}</div>
                    <div className="text-2xl">{b.icon}</div>
                    <div className="text-xs font-semibold mt-2" style={{color:theme.fg}}>AI: {b.action.charAt(0).toUpperCase() + b.action.slice(1)}</div>
                    <div className="text-xs text-gray-500 mt-1">{b.description}</div>
                  </div>
                )
              })}
            </div>

            {bandsEditMode && bands.length < 4 && (
              <button type="button"
                onClick={() => {
                  const newBand: RecommendationBand = {
                    id: `band-${Date.now()}`,
                    label: 'New band',
                    action: 'hold',
                    minScore: 0,
                    maxScore: 0,
                    color: 'orange',
                    icon: '🟠',
                    description: 'Custom band',
                  }
                  setValue('recommendationBands', [...bands, newBand], { shouldDirty: true })
                }}
                className="w-full mt-3 border-2 border-dashed border-gray-200 rounded-xl py-2 text-xs font-medium text-gray-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors">
                + Add Band
              </button>
            )}

            {bandErrors.length > 0 && (
              <div className="mt-3 rounded-xl p-3 text-xs" style={{background:"#FEE2E2", color:"#991B1B"}}>
                <p className="font-medium mb-1">Band ranges invalid:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {bandErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-xl p-4 text-sm" style={{background:"#E8F5EE"}}>
            <p className="font-medium mb-1" style={{color:"#0A3D2E"}}>How this works in your hiring:</p>
            <p style={{color:"#0F6E56"}}>Hard filters reject candidates before scoring. AI recommendation bands are advisory — recruiters make all advancement decisions. You&apos;ll see the AI&apos;s band on every candidate card; you Approve, Hold, or Reject from there.</p>
          </div>
        </div>

        <div className="flex justify-between mt-5">
          <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">← Back</button>
          <button onClick={createJobAndGenerateQuestions} disabled={isGeneratingQuestions || !stepValid}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60" style={{background:"#0A3D2E"}}>
            {isGeneratingQuestions ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Creating job...</> : "Next: Baseline Questions →"}
          </button>
        </div>

        {filterModalOpen && (
          <HardFilterModal
            initial={editingFilter}
            onSave={(f) => { updateFilter(f); setFilterModalOpen(false); setEditingFilterId(null) }}
            onClose={() => { setFilterModalOpen(false); setEditingFilterId(null) }}
          />
        )}
      </div>
    )
  }

  // STEP 4: BASELINE QUESTIONS
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">
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
            These questions are sent to every candidate via WhatsApp after CV approval. Edit or add your own.
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

        {/* 2.6.a — Recruiter-authored custom question */}
        {vals.screeningQuestions?.length > 0 && (
          <div>
            <button type="button"
              onClick={() => {
                const newQ = {
                  id: `custom-${Date.now()}`,
                  type: 'skill_probe' as const,
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatBandLabel(b: RecommendationBand): string {
  if (b.minScore === 0) return `Score < ${b.maxScore + 1}`
  if (b.maxScore === 100) return `Score ≥ ${b.minScore}`
  return `Score ${b.minScore}–${b.maxScore}`
}

function validateBands(bands: RecommendationBand[]): string[] {
  const errs: string[] = []
  if (bands.length < 2) errs.push('At least 2 bands required.')
  for (const b of bands) {
    if (b.minScore < 0 || b.minScore > 100) errs.push(`"${b.action}" min must be 0–100.`)
    if (b.maxScore < 0 || b.maxScore > 100) errs.push(`"${b.action}" max must be 0–100.`)
    if (b.minScore > b.maxScore) errs.push(`"${b.action}" min cannot exceed max.`)
  }
  if (errs.length) return errs
  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore)
  if (sorted[0].minScore !== 0) errs.push('Bands must start at 0.')
  if (sorted[sorted.length - 1].maxScore !== 100) errs.push('Bands must end at 100.')
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i]
    if (cur.minScore !== prev.maxScore + 1) {
      errs.push(`Gap or overlap between ${prev.minScore}-${prev.maxScore} and ${cur.minScore}-${cur.maxScore}.`)
    }
  }
  return errs
}

function filterValueSummary(f: HardFilter): string {
  switch (f.type) {
    case 'number': return f.numberValue !== undefined ? `${f.numberValue}` : '—'
    case 'text': return f.textValue || '—'
    case 'multi_select': return (f.multiValues && f.multiValues.length) ? f.multiValues.join(', ') : '—'
    case 'single_select': {
      const raw = f.singleValue || '—'
      return VISA_LABELS[raw] || NATIONALITY_LABELS[raw] || raw
    }
    case 'boolean': return f.booleanValue ? 'Yes' : 'No'
  }
}

// ── STEP-1-DERIVED FILTER ROW ─────────────────────────────────────────────────
// Read-only row for filters seeded from Role Basics. Edit jumps to Step 1;
// Delete unmarks the corresponding mandatory flag (handled by parent).
function Step1FilterRow({ filter, onEdit, onDelete }: {
  filter: HardFilter; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-b-0">
      <span className="px-1 py-1 mt-0.5 text-gray-300" title="Locked — edit on Step 1">🔒</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-700">{filter.name}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#E0F2FE', color: '#075985' }}>
            From Step 1
          </span>
        </div>
        <p className="text-xs text-gray-400">{filter.description}</p>
        {filter.type === 'multi_select' ? (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(filter.multiValues || []).length === 0 ? (
              <span className="text-xs text-gray-300 italic">No values</span>
            ) : (filter.multiValues || []).map(v => (
              <span key={v} className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: '#FEE2E2', color: '#991B1B' }}>✗ {v}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold mt-0.5" style={{ color: '#0A3D2E' }}>{filterValueSummary(filter)}</p>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1">
        <button type="button" onClick={onEdit} className="text-xs text-blue-500 underline">Edit</button>
        <button type="button" onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
      </div>
    </div>
  )
}

// ── SORTABLE FILTER ROW ───────────────────────────────────────────────────────
function SortableFilterRow({ filter, onEdit, onDelete }: {
  filter: HardFilter; onEdit: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: filter.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-b-0">
      <button {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500 px-1 py-1 mt-0.5" title="Drag to reorder">⋮⋮</button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-700">{filter.name}</p>
          {!filter.required && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{background:'#FEF3C7', color:'#92400E'}}>Soft</span>
          )}
        </div>
        <p className="text-xs text-gray-400">{filter.description}</p>
        {filter.type === 'multi_select' ? (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(filter.multiValues || []).length === 0 ? (
              <span className="text-xs text-gray-300 italic">No values</span>
            ) : (filter.multiValues || []).map(v => (
              <span key={v} className="px-2 py-0.5 rounded-md text-xs font-medium" style={{background:'#FEE2E2', color:'#991B1B'}}>✗ {v}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold mt-0.5" style={{color:'#0A3D2E'}}>{filterValueSummary(filter)}</p>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1">
        <button type="button" onClick={onEdit} className="text-xs text-blue-500 underline">Edit</button>
        <button type="button" onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
      </div>
    </div>
  )
}

// ── HARD FILTER MODAL ─────────────────────────────────────────────────────────
function HardFilterModal({ initial, onSave, onClose }: {
  initial?: HardFilter; onSave: (f: HardFilter) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [type, setType] = useState<FilterType>(initial?.type || 'text')
  const [description, setDescription] = useState(initial?.description || 'Candidates that fail this filter are rejected before scoring')
  const [required, setRequired] = useState(initial?.required ?? true)
  const [numberValue, setNumberValue] = useState<number>(initial?.numberValue ?? 0)
  const [textValue, setTextValue] = useState(initial?.textValue || '')
  const [multiValues, setMultiValues] = useState<string[]>(initial?.multiValues || [])
  const [singleValue, setSingleValue] = useState(initial?.singleValue || '')
  const [singleOptionsText, setSingleOptionsText] = useState((initial?.singleOptions || []).join(', '))
  const [booleanValue, setBooleanValue] = useState<boolean>(initial?.booleanValue ?? true)

  const save = () => {
    if (!name.trim()) { toast.error('Filter name is required'); return }
    const id = initial?.id || `hf-${Date.now()}`
    const base: HardFilter = { id, name: name.trim(), type, description: description.trim(), required }
    if (type === 'number') base.numberValue = numberValue
    if (type === 'text') base.textValue = textValue.trim()
    if (type === 'multi_select') base.multiValues = multiValues
    if (type === 'single_select') {
      const opts = singleOptionsText.split(',').map(s => s.trim()).filter(Boolean)
      if (opts.length === 0) { toast.error('Add at least one option'); return }
      base.singleOptions = opts
      base.singleValue = singleValue && opts.includes(singleValue) ? singleValue : opts[0]
    }
    if (type === 'boolean') base.booleanValue = booleanValue
    onSave(base)
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 bg-white"
  const labelCls = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4" style={{color:'#0A3D2E'}}>{initial ? 'Edit Filter' : 'Add Filter'}</h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Filter name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Minimum experience, Location, Education level" />
          </div>
          <div>
            <label className={labelCls}>Filter type</label>
            <select value={type} onChange={e => setType(e.target.value as FilterType)} className={inputCls}>
              <option value="number">Number</option>
              <option value="text">Text</option>
              <option value="multi_select">Multi-select tags</option>
              <option value="single_select">Single-select</option>
              <option value="boolean">Yes / No</option>
            </select>
          </div>

          {type === 'number' && (
            <div>
              <label className={labelCls}>Value</label>
              <input type="number" value={numberValue} onChange={e => setNumberValue(Number(e.target.value))} className={inputCls} />
            </div>
          )}
          {type === 'text' && (
            <div>
              <label className={labelCls}>Value</label>
              <input value={textValue} onChange={e => setTextValue(e.target.value)} className={inputCls} placeholder="e.g. Bachelor's degree" />
            </div>
          )}
          {type === 'multi_select' && (
            <div>
              <label className={labelCls}>Values (press Enter or comma to add)</label>
              <ModalTagInput tags={multiValues} onChange={setMultiValues} placeholder="e.g. Python, AWS, Docker" />
            </div>
          )}
          {type === 'single_select' && (
            <>
              <div>
                <label className={labelCls}>Options (comma-separated)</label>
                <input value={singleOptionsText} onChange={e => setSingleOptionsText(e.target.value)} className={inputCls} placeholder="e.g. Bachelor's, Master's, PhD" />
              </div>
              <div>
                <label className={labelCls}>Selected value</label>
                <select value={singleValue} onChange={e => setSingleValue(e.target.value)} className={inputCls}>
                  <option value="">— select —</option>
                  {singleOptionsText.split(',').map(s => s.trim()).filter(Boolean).map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {type === 'boolean' && (
            <div>
              <label className={labelCls}>Value</label>
              <select value={booleanValue ? 'true' : 'false'} onChange={e => setBooleanValue(e.target.value === 'true')} className={inputCls}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Rejection rule description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className={inputCls + ' resize-none'} placeholder="e.g. Candidates below this are rejected before scoring" />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} style={{accentColor:'#0A3D2E'}} />
            Required (mandatory) — uncheck to mark as soft preference
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={save}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white" style={{background:'#0A3D2E'}}>
            {initial ? 'Save changes' : 'Add filter'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Local TagInput for the modal (avoids reusing the main one's `color` styling defaults)
function ModalTagInput({ tags, onChange, placeholder }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) { onChange([...tags, v]); setInput('') }
  }
  return (
    <div className="border border-gray-200 rounded-xl p-2 flex flex-wrap gap-1.5 focus-within:border-emerald-400 transition-colors min-h-[40px]">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{background:'#FEE2E2', color:'#991B1B'}}>
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="ml-0.5 opacity-60 hover:opacity-100 text-xs">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : 'Add more...'}
        className="flex-1 min-w-[100px] text-xs outline-none bg-transparent py-0.5 px-1"
      />
    </div>
  )
}
