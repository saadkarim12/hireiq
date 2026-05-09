// Cheap, code-only hard filter for public-link submissions.
// Gates POST /public/jobs/:token/apply BEFORE we spend Claude on scoring —
// spam fails for free, valid CVs queue the existing async scoreCvAgainstJob.
// Lenient on purpose (substring match, 70% threshold) since Claude refines.

export type CheapFilterInput = {
  job: {
    minExperienceYears: number
    requiredSkills: string[]
  }
  parsedCv: {
    yearsExperienceTotal: number | null | undefined
    skills?: string[] | null
  }
  cvText?: string
}

export type CheapFilterResult =
  | { pass: true }
  | { pass: false; reason: string }

const REQUIRED_SKILL_MATCH_THRESHOLD = 0.7  // 70% of required skills must show up

export function applyHardFilter(input: CheapFilterInput): CheapFilterResult {
  const { job, parsedCv, cvText } = input
  const years = parsedCv.yearsExperienceTotal ?? 0

  if (job.minExperienceYears > 0 && years < job.minExperienceYears) {
    return {
      pass: false,
      reason: truncate(
        `Below minimum experience (need ${job.minExperienceYears}y, candidate has ${years}y)`,
      ),
    }
  }

  const required = (job.requiredSkills || []).filter(s => s && s.trim())
  if (required.length === 0) return { pass: true }

  const cvSkills = (parsedCv.skills || []).map(s => (s || '').toLowerCase())
  const haystack = (cvText || '').toLowerCase()

  const missing: string[] = []
  let found = 0
  for (const skill of required) {
    const needle = skill.toLowerCase()
    const inSkills = cvSkills.some(s => s.includes(needle))
    const inText   = haystack.includes(needle)
    if (inSkills || inText) found++
    else missing.push(skill)
  }

  const ratio = found / required.length
  if (ratio < REQUIRED_SKILL_MATCH_THRESHOLD) {
    return {
      pass: false,
      reason: truncate(`Missing required skills: ${missing.join(', ')}`),
    }
  }
  return { pass: true }
}

// hardFilterFailReason is VARCHAR(200) — see schema.prisma:226. Truncate
// long skill lists rather than hitting a Postgres column-length error.
function truncate(s: string, max = 200): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
