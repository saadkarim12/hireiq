// src/ai-engine/ai-service.ts
//
// Single source of truth for HireIQ's AI behaviour. Tune scoring weights,
// prompt copy, question categories, and tool schemas here — every AI route
// imports from this file. No prompt strings live in route handlers.

import type Anthropic from '@anthropic-ai/sdk'
import { callClaudeWithTool } from './claude-client'

// ─────────────────────────────────────────────────────────────────────────────
// CV Screening weights (Applied stage — CV-only) — v1.13.0 refactor
// ─────────────────────────────────────────────────────────────────────────────
// cvScreeningScore = (skillsScore + experienceScore) / 2
// Two factors, equal weight. Adjust here, no other code change required.

export const APPLIED_SCORE_WEIGHTS = {
  SKILLS:     0.50,
  EXPERIENCE: 0.50,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Semantic skills definition — what skillsScore means to Claude
// ─────────────────────────────────────────────────────────────────────────────
// The skills score is a SEMANTIC match, not keyword search. "Built REST APIs
// in Node.js" should count toward a "Node.js" or "backend development"
// requirement. Reward demonstrated use (projects, achievements, timeline),
// penalise bare keyword stuffing with no supporting evidence.

export const SKILLS_DEFINITION = `Skills score is a 0-100 SEMANTIC match between the CV and the job's required skills:
  - 100 = every required skill is clearly evidenced in the CV (real project usage, achievements, or measurable outcomes)
  - 50 = roughly half of the required skills are evidenced, or all are mentioned weakly
  - 0 = none of the required skills appear in any recognisable form
Count synonyms and related technologies (e.g. "REST APIs in Node" → Node.js; "Azure DevOps pipelines" → CI/CD). Do NOT count bare keyword lists with no supporting work history. For each required skill, quote the CV phrase where it is evidenced, or set found=false.`

// ─────────────────────────────────────────────────────────────────────────────
// Baseline question categories (Step 4 of job creation)
// ─────────────────────────────────────────────────────────────────────────────
// Every generated question must be tagged with exactly one of these. The prompt
// guarantees at least one question per category.

export const QUESTION_CATEGORIES = {
  BACKGROUND_VALIDATION: 'background_validation',
  COMMITMENT:            'commitment',
  SALARY:                'salary',
} as const

export type QuestionCategory = typeof QUESTION_CATEGORIES[keyof typeof QUESTION_CATEGORIES]

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  background_validation: 'Background Validations',
  commitment:            'Commitment to the Job',
  salary:                'Salary Expectations',
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT: CV scoring (Applied stage, CV-only)
// ─────────────────────────────────────────────────────────────────────────────

export const CV_SCORING_SYSTEM_PROMPT = `You are HireIQ's CV screening engine for UAE and KSA recruitment.
Score the CV on EXACTLY TWO dimensions, each 0-100:

  1. SKILLS (weight ${APPLIED_SCORE_WEIGHTS.SKILLS * 100}%)
     ${SKILLS_DEFINITION}

  2. EXPERIENCE (weight ${APPLIED_SCORE_WEIGHTS.EXPERIENCE * 100}%)
     Compare candidate's years of experience against the job's minimum. Meeting the minimum = 80+. Significantly exceeding it = 90-100. Below the minimum scales down proportionally (50% short = 40, missing entirely = 0). Reason about the experience SEMANTICALLY — count years in roles that are clearly relevant to the job's domain more heavily than years in unrelated roles.

HireIQ averages the two component scores to produce cvScreeningScore — DO NOT compute the average yourself, just return the two components honestly.

parseConfidence: 0=garbled / table-extracted / image PDF, 100=clean plain text.
Flag AI-generated CVs: perfect JD keyword match, skills with no timeline support, generic achievement language → authenticityFlag medium/high.`

export const buildCvScoringUserPrompt = (args: {
  job:       { title: string; hiringCompany: string; locationCountry: string; minExperienceYears: number; requiredSkills: string[] }
  mustHave:  string[]
  candidate: { currentRole?: string | null; yearsExperience?: number | null; visaStatus?: string | null; cvSkills: string[]; cvStructured: unknown }
}) => `Score this candidate CV against the job.

JOB
  Title: ${args.job.title} at ${args.job.hiringCompany} (${args.job.locationCountry})
  Min experience: ${args.job.minExperienceYears} years
  Required skills: ${args.job.requiredSkills.join(', ')}
  Must-have (from JD extraction): ${args.mustHave.join(', ') || 'Not specified'}

CANDIDATE
  Current role: ${args.candidate.currentRole || 'Unknown'}
  Years of experience: ${args.candidate.yearsExperience ?? 'Unknown'}
  Visa: ${args.candidate.visaStatus || 'Unknown'}
  CV skills (parsed): ${args.candidate.cvSkills.join(', ') || 'None parsed'}
  CV data: ${JSON.stringify(args.candidate.cvStructured || {}).slice(0, 800)}`

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT: JD criteria extraction
// ─────────────────────────────────────────────────────────────────────────────

export const JD_EXTRACTION_SYSTEM_PROMPT = `You are a senior recruitment consultant specialising in UAE and KSA markets.
You analyse job descriptions and extract structured requirements.
You understand Gulf workplace culture and local context.
Cap mustHave at 3-5 items — these are the genuinely non-negotiable skills, not every nice-to-have.
Respond only using the provided tool.`

export const buildJdExtractionUserPrompt = (args: {
  title: string; hiringCompany: string; locationCountry: string
  requiredSkills?: string[]; minExperienceYears?: number; jdText: string
}) => `Analyse this job description and extract requirements:

Job Title: ${args.title}
Hiring Company: ${args.hiringCompany}
Country: ${args.locationCountry}
Required Skills: ${args.requiredSkills?.join(', ') || 'Not specified'}
Min Experience: ${args.minExperienceYears ?? 'Not specified'} years

Job Description:
---
${args.jdText}
---`

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT: Baseline screening question generation
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTION_GENERATION_SYSTEM_PROMPT = `You are an expert recruitment consultant with 15 years experience in UAE and KSA.
You create WhatsApp screening questions that are conversational and reveal genuine candidate quality.
Questions must be answerable in 2-4 sentences. No yes/no.
Generate questions in BOTH English and formal Gulf Arabic.

Every generated set MUST include AT LEAST ONE question in EACH of these three categories:
  • background_validation — verify a specific must-have on the CV (e.g. "Walk me through a time you used <skill> in a real project")
  • commitment — surface motivation, notice period, willingness to commit (e.g. "What's drawing you to this specific role?")
  • salary — current package and expectation (framed naturally, not transactional)

Tag each question with its category. Do not omit any of the three categories.
Respond only using the provided tool.`

export const buildQuestionGenerationUserPrompt = (args: {
  title: string; locationCountry: string
  roleCategory?: string; mustHave?: string[]
  // Optional: recruiter-marked "AI-mandatory" fields. The prompt MUST generate
  // a question covering each, on top of the three required categories.
  aiMandatoryFields?: string[]
}) => `Generate 5-7 WhatsApp screening questions for this role:

Job Title: ${args.title}
Role Category: ${args.roleCategory || 'Unknown'}
Must-Have Requirements: ${args.mustHave?.join(', ') || 'Not specified'}
Country: ${args.locationCountry}
${args.aiMandatoryFields?.length ? `\nAdditional fields the recruiter flagged as AI-mandatory (generate one question per field on top of the three required categories): ${args.aiMandatoryFields.join(', ')}` : ''}

Coverage requirements:
  • At least 1 background_validation question (probe a must-have skill from the CV)
  • At least 1 commitment question (motivation / notice / availability)
  • At least 1 salary question (current + expected, framed naturally for Gulf context)
  • Plus 2-4 role-specific situational or technical questions tagged with the most appropriate category`

// ─────────────────────────────────────────────────────────────────────────────
// TOOL SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

// CV scoring tool — returns the TWO components, evidence, tags.
// HireIQ averages the components to produce cvScreeningScore.
export const CV_SCORING_TOOL: Anthropic.Tool = {
  name: 'score_cv',
  description: 'Score a CV against a job on semantic skills match and experience fit',
  input_schema: {
    type: 'object' as const,
    properties: {
      skillsScore:          { type: 'number', description: '0-100. Semantic match of CV against the job\'s required skills (counts synonyms, project usage, real evidence — not just keyword presence)' },
      experienceScore:      { type: 'number', description: '0-100. Fit of candidate years/seniority vs job\'s minimum experience' },
      authenticityFlag:     { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
      parseConfidence:      { type: 'number', description: '0-100, how cleanly the CV was parsed' },
      evidence: {
        type: 'object',
        properties: {
          experience: {
            type: 'object',
            properties: {
              found:    { type: 'boolean' },
              years:    { type: 'number' },
              evidence: { type: 'string', description: 'One sentence justifying the experience score' },
            },
          },
          skillsBreakdown: {
            type: 'array',
            description: 'Per required skill: whether semantically evidenced and the CV phrase that proves it',
            items: {
              type: 'object',
              properties: {
                skill:    { type: 'string' },
                found:    { type: 'boolean' },
                evidence: { type: 'string', description: 'Exact CV phrase showing the skill in use, or "" if not found' },
              },
            },
          },
          aiAlterationFlags: { type: 'array', items: { type: 'string' } },
        },
      },
      dataTags: {
        type: 'object',
        properties: {
          seniorityLevel:     { type: 'string' },
          roleCategory:       { type: 'string' },
          languageCapability: { type: 'string' },
        },
      },
    },
    required: ['skillsScore', 'experienceScore', 'evidence', 'dataTags', 'parseConfidence'],
  },
}

export const JD_EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_jd_criteria',
  description: 'Extract structured requirements from a job description',
  input_schema: {
    type: 'object' as const,
    properties: {
      mustHave:             { type: 'array', items: { type: 'string' }, description: '3-5 non-negotiable requirements' },
      niceToHave:           { type: 'array', items: { type: 'string' }, description: 'Preferred but not required' },
      seniorityLevel:       { type: 'string', enum: ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Manager', 'Director', 'Executive'] },
      roleCategory:         { type: 'string', description: 'Finance & Accounting, Software Development, etc.' },
      minExperienceImplied: { type: 'number', description: 'Minimum years of experience implied' },
      keyResponsibilities:  { type: 'array', items: { type: 'string' }, description: 'Top 5 responsibilities' },
    },
    required: ['mustHave', 'niceToHave', 'seniorityLevel', 'roleCategory'],
  },
}

export const QUESTION_GENERATION_TOOL: Anthropic.Tool = {
  name: 'generate_screening_questions',
  description: 'Generate WhatsApp screening questions covering background_validation, commitment, and salary',
  input_schema: {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:             { type: 'string' },
            questionTextEn: { type: 'string', description: 'Question in English' },
            questionTextAr: { type: 'string', description: 'Question in Gulf Arabic' },
            rationale:      { type: 'string', description: 'Why this question is asked' },
            category:       { type: 'string', enum: ['background_validation', 'commitment', 'salary'], description: 'Which baseline category this question covers' },
            type:           { type: 'string', enum: ['motivation', 'experience', 'salary', 'availability', 'skill_probe'], description: 'Legacy fine-grained type — keep populated' },
          },
          required: ['id', 'questionTextEn', 'questionTextAr', 'rationale', 'category', 'type'],
        },
      },
    },
    required: ['questions'],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — call Claude with the right prompt + tool combination
// ─────────────────────────────────────────────────────────────────────────────

export interface CvScoreComponents {
  skillsScore:          number
  experienceScore:      number
  authenticityFlag?:    'none' | 'low' | 'medium' | 'high'
  parseConfidence?:     number
  evidence?:            any
  dataTags?:            any
}

export interface CvScoreResult extends CvScoreComponents {
  cvScreeningScore: number
  scoreBreakdown: {
    skills:     number
    experience: number
    weights:    typeof APPLIED_SCORE_WEIGHTS
  }
}

export const computeCvScreeningScore = (c: Pick<CvScoreComponents, 'skillsScore' | 'experienceScore'>): number =>
  Math.round(
    c.skillsScore     * APPLIED_SCORE_WEIGHTS.SKILLS +
    c.experienceScore * APPLIED_SCORE_WEIGHTS.EXPERIENCE,
  )

export async function scoreCvAgainstJob(args: {
  job:       Parameters<typeof buildCvScoringUserPrompt>[0]['job']
  mustHave:  string[]
  candidate: Parameters<typeof buildCvScoringUserPrompt>[0]['candidate']
}): Promise<CvScoreResult> {
  const components = await callClaudeWithTool<CvScoreComponents>(
    CV_SCORING_SYSTEM_PROMPT,
    buildCvScoringUserPrompt(args),
    [CV_SCORING_TOOL],
    'score_cv',
  )

  const cvScreeningScore = computeCvScreeningScore(components)

  return {
    ...components,
    cvScreeningScore,
    scoreBreakdown: {
      skills:     components.skillsScore,
      experience: components.experienceScore,
      weights:    APPLIED_SCORE_WEIGHTS,
    },
  }
}

export async function extractJdCriteria(args: Parameters<typeof buildJdExtractionUserPrompt>[0]) {
  return callClaudeWithTool<any>(
    JD_EXTRACTION_SYSTEM_PROMPT,
    buildJdExtractionUserPrompt(args),
    [JD_EXTRACTION_TOOL],
    'extract_jd_criteria',
  )
}

export async function generateBaselineQuestions(args: Parameters<typeof buildQuestionGenerationUserPrompt>[0]) {
  return callClaudeWithTool<{ questions: any[] }>(
    QUESTION_GENERATION_SYSTEM_PROMPT,
    buildQuestionGenerationUserPrompt(args),
    [QUESTION_GENERATION_TOOL],
    'generate_screening_questions',
  )
}
