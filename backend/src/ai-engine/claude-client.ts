// src/ai-engine/claude-client.ts
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../shared/logger'

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = 'claude-sonnet-4-5'

// ── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

export const JD_TOOLS: Anthropic.Tool[] = [
  {
    name: 'extract_jd_criteria',
    description: 'Extract structured requirements from a job description',
    input_schema: {
      type: 'object' as const,
      properties: {
        mustHave:           { type: 'array', items: { type: 'string' }, description: 'Non-negotiable requirements' },
        niceToHave:         { type: 'array', items: { type: 'string' }, description: 'Preferred but not required' },
        seniorityLevel:     { type: 'string', enum: ['Junior','Mid-Level','Senior','Lead','Manager','Director','Executive'] },
        roleCategory:       { type: 'string', description: 'Finance & Accounting, Software Development, etc.' },
        minExperienceImplied: { type: 'number', description: 'Minimum years of experience implied' },
        keyResponsibilities: { type: 'array', items: { type: 'string' }, description: 'Top 5 responsibilities' },
      },
      required: ['mustHave', 'niceToHave', 'seniorityLevel', 'roleCategory'],
    },
  },
]

export const QUESTION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_screening_questions',
    description: 'Generate WhatsApp screening questions for a job role',
    input_schema: {
      type: 'object' as const,
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:              { type: 'string' },
              questionTextEn:  { type: 'string', description: 'Question in English' },
              questionTextAr:  { type: 'string', description: 'Question in Gulf Arabic' },
              rationale:       { type: 'string', description: 'Why this question is asked' },
              type:            { type: 'string', enum: ['motivation','experience','salary','availability','skill_probe'] },
            },
            required: ['id','questionTextEn','questionTextAr','rationale','type'],
          },
        },
      },
      required: ['questions'],
    },
  },
]

export const CV_TOOLS: Anthropic.Tool[] = [
  {
    name: 'parse_cv',
    description: 'Parse a CV and extract structured information',
    input_schema: {
      type: 'object' as const,
      properties: {
        fullName:           { type: 'string' },
        email:              { type: 'string' },
        phone:              { type: 'string' },
        nationality:        { type: 'string' },
        currentLocation:    { type: 'string' },
        currentRole:        { type: 'string' },
        currentCompany:     { type: 'string' },
        yearsExperienceTotal: { type: 'number' },
        experience: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              company:     { type: 'string' },
              role:        { type: 'string' },
              startDate:   { type: 'string' },
              endDate:     { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        education: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              institution: { type: 'string' },
              degree:      { type: 'string' },
              field:       { type: 'string' },
              year:        { type: 'number' },
            },
          },
        },
        skills:          { type: 'array', items: { type: 'string' } },
        languages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              language:    { type: 'string' },
              proficiency: { type: 'string' },
            },
          },
        },
        certifications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:   { type: 'string' },
              issuer: { type: 'string' },
              year:   { type: 'number' },
            },
          },
        },
        parseConfidence: { type: 'number', description: 'Confidence score 0-100' },
      },
      required: ['fullName','yearsExperienceTotal','skills'],
    },
  },
]

export const SCORE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'score_candidate',
    description: 'Score and tag a candidate against a job description',
    input_schema: {
      type: 'object' as const,
      properties: {
        commitmentScore:  { type: 'number', description: 'Score 0-100 from screening answers' },
        cvMatchScore:     { type: 'number', description: 'Score 0-100 CV vs JD match' },
        salaryFitScore:   { type: 'number', description: 'Score 0-100 salary alignment' },
        compositeScore:   { type: 'number', description: 'Weighted composite 0-100' },
        hardFilterPass:   { type: 'boolean' },
        hardFilterFailReason: { type: 'string' },
        authenticityFlag: { type: 'string', enum: ['none','low','medium','high'] },
        dataTags: {
          type: 'object',
          properties: {
            seniorityLevel:      { type: 'string' },
            roleCategory:        { type: 'string' },
            languageCapability:  { type: 'string' },
            availability:        { type: 'string' },
          },
        },
        flags: { type: 'array', items: { type: 'string' }, description: 'Any concerns or flags' },
      },
      required: ['commitmentScore','cvMatchScore','salaryFitScore','compositeScore','hardFilterPass','dataTags'],
    },
  },
]

export const SUMMARY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_candidate_summary',
    description: 'Write a 3-5 sentence recruiter briefing for a candidate',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: '3-5 sentence professional briefing in English' },
      },
      required: ['summary'],
    },
  },
]

// ── HELPER: call Claude with tools ────────────────────────────────────────────
export async function callClaudeWithTool<T>(
  systemPrompt: string,
  userPrompt: string,
  tools: Anthropic.Tool[],
  toolName: string
): Promise<T> {
  logger.debug(`Claude API call: ${toolName}`)

  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools,
    tool_choice: { type: 'any' },
  })

  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === toolName)
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Claude did not call tool: ${toolName}`)
  }

  return toolUse.input as T
}
