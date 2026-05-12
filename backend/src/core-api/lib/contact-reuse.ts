// Contact write-time copy (v1.13.0).
//
// Same person can apply to multiple jobs at the same agency. The spec asks
// that we store name/email/phone "only if not already stored for that user."
// There is no Person entity — each Candidate row is per-job. So this helper
// looks up other Candidate rows in the same agency that share email or
// waNumberHash, and copies over fullName / phoneNumber when the new parse
// missed them.
//
// Cheap call: one indexed read per insert.
import { prisma } from '../../shared/db'

export interface ContactCandidate {
  fullName:     string | null | undefined
  email:        string | null | undefined
  phoneNumber:  string | null | undefined
  waNumberHash: string | null | undefined
}

export async function fillContactFromHistory(
  agencyId: string,
  candidate: ContactCandidate,
): Promise<{ fullName: string | null; phoneNumber: string | null }> {
  const fullName    = candidate.fullName?.trim()    || null
  const phoneNumber = candidate.phoneNumber?.trim() || null

  if (fullName && phoneNumber) {
    return { fullName, phoneNumber }
  }

  const conditions: any[] = []
  if (candidate.email)        conditions.push({ email: candidate.email })
  if (candidate.waNumberHash) conditions.push({ waNumberHash: candidate.waNumberHash })
  if (conditions.length === 0) {
    return { fullName, phoneNumber }
  }

  const prior = await prisma.candidate.findFirst({
    where:    { agencyId, OR: conditions, AND: [{ OR: [{ fullName: { not: null } }, { phoneNumber: { not: null } }] }] },
    orderBy:  { createdAt: 'desc' },
    select:   { fullName: true, phoneNumber: true },
  })

  return {
    fullName:    fullName    || prior?.fullName    || null,
    phoneNumber: phoneNumber || prior?.phoneNumber || null,
  }
}
