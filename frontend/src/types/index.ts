// src/types/index.ts
// Core TypeScript types for HireIQ frontend

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type UserRole = 'agency_admin' | 'senior_recruiter' | 'recruiter' | 'viewer' | 'hireiq_admin'
export type UserStatus = 'invited' | 'active' | 'disabled'
export type SubscriptionTier = 'pilot' | 'starter' | 'growth' | 'enterprise'
export type JobStatus = 'draft' | 'active' | 'paused' | 'closed'
export type JobType = 'onsite' | 'hybrid' | 'remote'
export type Currency = 'AED' | 'SAR' | 'USD'
export type Language = 'ar' | 'en'

export type PipelineStage =
  | 'applied'
  | 'screening'
  | 'cv_received'
  | 'evaluated'
  | 'shortlisted'
  | 'interviewing'
  | 'offered'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'held'

export type ConversationState =
  | 'initiated'
  | 'language_selection'
  | 'consent_pending'
  | 'screening_q1' | 'screening_q2' | 'screening_q3' | 'screening_q4' | 'screening_q5' | 'screening_q6'
  | 'cv_requested'
  | 'cv_received'
  | 'profile_collection'
  | 'processing'
  | 'shortlisted'
  | 'slots_requested'
  | 'scheduled'
  | 'completed'
  | 'timeout'

export type SeniorityLevel = 'Intern' | 'Junior' | 'Mid-Level' | 'Senior' | 'Lead' | 'Manager' | 'Director' | 'Executive' | 'C-Level'
export type RoleCategory =
  | 'Software Development'
  | 'Design & UX'
  | 'Finance & Accounting'
  | 'HR & Talent'
  | 'Sales & BD'
  | 'Marketing'
  | 'Operations'
  | 'Legal'
  | 'Engineering'
  | 'Healthcare'
  | 'Construction'
  | 'Hospitality'
  | 'Education'
  | 'Other'

export type LanguageCapability = 'Arabic Only' | 'English Only' | 'Bilingual Arabic-English' | 'Other'
export type Availability = 'Immediate' | '30 Days' | '60 Days' | '90 Days' | '90+ Days' | 'Not Looking'

export type RejectionReason = 'overqualified' | 'underqualified' | 'salary_mismatch' | 'visa' | 'no_response' | 'other'
export type AuthenticityFlag = 'none' | 'low' | 'medium' | 'high'
export type MessageDirection = 'inbound' | 'outbound'
export type AnswerQuality = 'specific' | 'adequate' | 'vague' | 'evasive'

// ─── ENTITIES ─────────────────────────────────────────────────────────────────

export interface Agency {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  waNumber: string | null
  emailFromName: string | null
  emailFromAddress: string | null
  subscriptionTier: SubscriptionTier
  isActive: boolean
  createdAt: string
}

export interface User {
  id: string
  agencyId: string
  email: string
  fullName: string
  role: UserRole
  avatarUrl: string | null
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
}

export interface Job {
  id: string
  agencyId: string
  recruiterId: string
  title: string
  hiringCompany: string
  locationCountry: string
  locationCity: string
  jobType: JobType
  salaryMin: number
  salaryMax: number
  currency: Currency
  requiredSkills: string[]
  preferredSkills: string[]
  minExperienceYears: number
  requiredLanguages: string[]
  jdText: string
  extractedCriteria: {
    mustHave: string[]
    niceToHave: string[]
    seniorityLevel: SeniorityLevel
    roleCategory: RoleCategory
  } | null
  screeningQuestions: ScreeningQuestion[] | null
  applyUrlSlug: string
  waShortcode: string
  status: JobStatus
  closingDate: string | null
  activatedAt: string | null
  closedAt: string | null
  createdAt: string
  // Computed fields from backend
  applicationsCount?: number
  shortlistedCount?: number
  daysOpen?: number
}

export interface ScreeningQuestion {
  id: string
  questionTextEn: string
  questionTextAr: string
  rationale: string
  type: 'motivation' | 'experience' | 'salary' | 'availability' | 'skill_probe'
}

export interface DataTags {
  seniorityLevel: SeniorityLevel | null
  roleCategory: RoleCategory | null
  languageCapability: LanguageCapability | null
  availability: Availability | null
  sourceChannel: string | null
  cvType: 'full_cv' | 'wa_profile' | 'no_submission' | null
}

export interface CandidateScores {
  commitmentScore: number | null
  cvMatchScore: number | null
  salaryFitScore: number | null
  compositeScore: number | null
  hardFilterPass: boolean | null
  hardFilterFailReason: string | null
}

export interface CandidateSummary {
  id: string
  agencyId: string
  jobId: string
  fullName: string | null
  currentRole: string | null
  yearsExperience: number | null
  salaryExpectation: number | null
  noticePeriodDays: number | null
  visaStatus: string | null
  cvType: 'full_cv' | 'wa_profile' | 'no_submission' | null
  authenticityFlag: AuthenticityFlag
  scores: CandidateScores
  aiSummary: string | null
  dataTags: DataTags
  pipelineStage: PipelineStage
  conversationState: ConversationState
  createdAt: string
  shortlistedAt: string | null
}

export interface CandidateFull extends CandidateSummary {
  email: string | null
  preferredLanguage: Language | null
  cvStructured: {
    experience: Array<{
      company: string
      role: string
      startDate: string
      endDate: string | null
      description: string
    }>
    skills: string[]
    education: Array<{
      institution: string
      degree: string
      field: string
      year: number
    }>
    languages: Array<{
      language: string
      proficiency: string
    }>
    certifications: Array<{
      name: string
      issuer: string
      year: number
    }>
  } | null
  cvFileUrl: string | null
  cvPreviewUrl: string | null
  rejectionReason: RejectionReason | null
  recruiterNote: string | null
  interview: Interview | null
  screeningTranscript: ScreeningMessage[]
}

export interface ScreeningMessage {
  id: string
  candidateId: string
  direction: MessageDirection
  messageType: string
  content: string
  waMessageId: string | null
  deliveryStatus: string | null
  questionIndex: number | null
  answerScore: number | null
  answerQuality: AnswerQuality | null
  createdAt: string
}

export interface Interview {
  id: string
  candidateId: string
  jobId: string
  recruiterId: string
  scheduledAt: string | null
  candidateSlotsOffered: Array<{ date: string; time: string; confidence: string }> | null
  status: 'awaiting_slots' | 'confirmed' | 'reminder_sent' | 'completed' | 'no_show' | 'cancelled'
  outcome: 'advanced' | 'rejected' | 'on_hold' | null
  interviewNotes: string | null
  createdAt: string
}

// ─── PIPELINE ─────────────────────────────────────────────────────────────────

export interface PipelineCounts {
  applied: number
  screening: number
  cvReceived: number
  evaluated: number
  shortlisted: number
  interviewing: number
  offered: number
  hired: number
  rejected: number
  held: number
  total: number
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  totalApplications: number
  totalScreened: number
  totalShortlisted: number
  avgTimeToShortlistHours: number
  interviewNoShowRate: number
  hireRate: number
  topSourceChannels: Array<{ channel: string; count: number; percentage: number }>
}

export interface JobAnalytics {
  jobId: string
  title: string
  applications: number
  screenedPercent: number
  shortlistedPercent: number
  avgScore: number
  daysOpen: number
  pipelineVelocity: number
  status: JobStatus
}

// ─── API RESPONSES ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: {
    code: string
    message: string
  }
  meta?: {
    cursor?: string
    hasMore?: boolean
    total?: number
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    cursor: string | null
    hasMore: boolean
    total?: number
  }
}

// ─── FORM TYPES ───────────────────────────────────────────────────────────────

export interface CreateJobForm {
  title: string
  hiringCompany: string
  locationCountry: string
  locationCity: string
  jobType: JobType
  salaryMin: number
  salaryMax: number
  currency: Currency
  requiredSkills: string[]
  preferredSkills: string[]
  minExperienceYears: number
  requiredLanguages: string[]
  jdText: string
  closingDate?: string
}

export interface UpdateCandidateStatusForm {
  pipelineStage: PipelineStage
  rejectionReason?: RejectionReason
  note?: string
}

// ─── UI STATE ─────────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  type: 'shortlist_ready' | 'new_application' | 'interview_confirmed' | 'no_show' | 'system'
  title: string
  message: string
  jobId?: string
  jobTitle?: string
  isRead: boolean
  createdAt: string
}

export interface DashboardKPIs {
  activeJobs: number
  newApplications: number
  shortlistsReady: number
  interviewsToday: number
}
