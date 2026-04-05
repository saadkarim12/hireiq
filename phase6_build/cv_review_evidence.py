import os

# Create the CV Review Dashboard with evidence layer
path = os.path.expanduser('~/hireiq/frontend/src/components/candidates/CvReviewCard.tsx')

content = '''\'use client\'
import { useState } from \'react\'

interface SkillEvidence {
  skill: string
  found: boolean
  evidence: string
}

interface Evidence {
  experience?: { found: boolean; years: number; evidence: string }
  mustHaveSkills?: SkillEvidence[]
  salaryEvidence?: string
  visaEvidence?: string
  aiAlterationFlags?: string[]
}

interface ReturningCandidate {
  isReturning: boolean
  previousJobTitle?: string
  previousDate?: string
  previousStatus?: string
  cvChangePercent?: number
  previousCount?: number
}

interface CvReviewCardProps {
  candidate: {
    id: string
    fullName: string | null
    currentRole: string | null
    compositeScore: number | null
    cvMatchScore: number | null
    commitmentScore: number | null
    salaryFitScore: number | null
    salaryExpectation: number | null
    yearsExperience: number | null
    authenticityFlag: string
    hardFilterPass: boolean | null
    hardFilterFailReason: string | null
    dataTags: any
    aiSummary: string | null
    pipelineStage: string
  }
  jobCurrency?: string
  onConfirm: (id: string) => void
  onReject: (id: string) => void
  onShortlist: (id: string) => void
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium w-6 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

export function CvReviewCard({ candidate, jobCurrency = \'AED\', onConfirm, onReject, onShortlist }: CvReviewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const tags = candidate.dataTags as any
  const evidence: Evidence = tags?.evidence || {}
  const returning: ReturningCandidate = tags?.returningCandidate || { isReturning: false }
  const parseConfidence: number = tags?.parseConfidence || 75

  const score = candidate.compositeScore || 0
  const scoreColor = score >= 75 ? \'#166534\' : score >= 55 ? \'#92400E\' : \'#991B1B\'
  const scoreBg = score >= 75 ? \'bg-green-50\' : score >= 55 ? \'bg-amber-50\' : \'bg-red-50\'

  return (
    <div className={`border rounded-xl overflow-hidden mb-3 ${
      returning.isReturning ? \'border-amber-300\' : \'border-gray-200\'
    }`}>

      {/* Returning candidate banner */}
      {returning.isReturning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <div className="flex-1">
            <span className="text-xs font-medium text-amber-800">Returning candidate — </span>
            <span className="text-xs text-amber-700">
              Previously applied for {returning.previousJobTitle} on {returning.previousDate} ({returning.previousStatus?.replace(\'_\', \' \')})
            </span>
            {returning.cvChangePercent && returning.cvChangePercent > 15 && (
              <span className="text-xs text-amber-700 ml-1">
                · CV changed {returning.cvChangePercent}%
              </span>
            )}
          </div>
          {returning.cvChangePercent && returning.cvChangePercent > 30 && (
            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
              Significant CV change
            </span>
          )}
        </div>
      )}

      {/* AI alteration warning */}
      {candidate.authenticityFlag === \'high\' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-medium text-red-700">AI alteration suspected — review CV carefully</span>
        </div>
      )}

      {/* Parse confidence warning */}
      {parseConfidence < 70 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2">
          <span className="text-sm">📄</span>
          <span className="text-xs text-blue-700">CV format made automated parsing difficult (confidence {parseConfidence}%) — manual review recommended</span>
        </div>
      )}

      {/* Main card */}
      <div className="p-4 bg-white">
        <div className="flex items-start gap-3">

          {/* Avatar */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: \'#E8F5EE\', color: \'#0A3D2E\' }}>
            {candidate.fullName?.split(\' \').map(n => n[0]).join(\'\').slice(0, 2) || \'??\'} 
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{candidate.fullName || \'Unknown\'}</h3>
              {candidate.hardFilterPass === false && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Hard filter fail</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{candidate.currentRole || \'Role not specified\'}</p>
            {candidate.yearsExperience && (
              <p className="text-xs text-gray-400">{candidate.yearsExperience} years experience</p>
            )}
          </div>

          {/* Score */}
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${scoreBg}`}>
            <span className="text-xl font-bold" style={{ color: scoreColor }}>{score}</span>
            <span className="text-xs" style={{ color: scoreColor }}>/ 100</span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="mt-3 space-y-1.5">
          <ScoreBar score={candidate.cvMatchScore || 0} color="#0F6E56" />
          <div className="flex justify-between text-xs text-gray-400">
            <span>CV match (40%)</span>
            <span>Commitment (40%)</span>
            <span>Salary fit (20%)</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <ScoreBar score={candidate.cvMatchScore || 0} color="#0F6E56" />
            <ScoreBar score={candidate.commitmentScore || 0} color="#0A3D2E" />
            <ScoreBar score={candidate.salaryFitScore || 0} color="#C9A84C" />
          </div>
        </div>

        {/* Evidence section */}
        {evidence.mustHaveSkills && evidence.mustHaveSkills.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Must-have skills</p>
            <div className="flex flex-wrap gap-1.5">
              {evidence.mustHaveSkills.map((s, i) => (
                <div key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                  s.found ? \'bg-green-50 text-green-700\' : \'bg-red-50 text-red-700\'
                }`} title={s.evidence || \'Not found in CV\'}>
                  <span>{s.found ? \'✓\' : \'✗\'}</span>
                  <span className="font-medium">{s.skill}</span>
                  {s.found && s.evidence && (
                    <span className="text-green-500 text-xs">·</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Experience evidence */}
        {evidence.experience && (
          <div className="mt-2 text-xs">
            <span className={evidence.experience.found ? \'text-green-600\' : \'text-red-600\'}>
              {evidence.experience.found ? \'✓\' : \'✗\'} Experience: {evidence.experience.years || 0} yrs
            </span>
            {evidence.experience.evidence && (
              <span className="text-gray-400 ml-1">"{evidence.experience.evidence.slice(0, 60)}..."</span>
            )}
          </div>
        )}

        {/* Salary evidence */}
        {candidate.salaryExpectation && (
          <div className="mt-1 text-xs text-gray-500">
            💰 Expects {jobCurrency} {candidate.salaryExpectation.toLocaleString()}/month
            {evidence.salaryEvidence && <span className="text-gray-400 ml-1">· "{evidence.salaryEvidence.slice(0, 50)}"</span>}
          </div>
        )}

        {/* AI Summary */}
        {candidate.aiSummary && (
          <div className="mt-3">
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              {expanded ? \'▼\' : \'▶\'} AI summary
            </button>
            {expanded && (
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-2.5">
                {candidate.aiSummary}
              </p>
            )}
          </div>
        )}

        {/* AI alteration details */}
        {evidence.aiAlterationFlags && evidence.aiAlterationFlags.length > 0 && (
          <div className="mt-2 bg-orange-50 rounded-lg p-2.5">
            <p className="text-xs font-medium text-orange-700 mb-1">Integrity flags:</p>
            {evidence.aiAlterationFlags.map((flag, i) => (
              <p key={i} className="text-xs text-orange-600">· {flag}</p>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button onClick={() => onConfirm(candidate.id)}
            className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all text-white"
            style={{ background: \'#0A3D2E\' }}>
            Confirm → WhatsApp
          </button>
          <button onClick={() => onShortlist(candidate.id)}
            className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all">
            Shortlist directly
          </button>
          <button onClick={() => onReject(candidate.id)}
            className="py-2 px-3 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all">
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}
'''

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w') as f:
    f.write(content)
print(f"✅ CvReviewCard.tsx created")

# Create CV Review tab page
page_path = os.path.expanduser('~/hireiq/frontend/src/app/(dashboard)/jobs/[id]/cv-review/page.tsx')
os.makedirs(os.path.dirname(page_path), exist_ok=True)

page_content = '''\'use client\'
import { useState } from \'react\'
import { useQuery, useMutation, useQueryClient } from \'@tanstack/react-query\'
import { api } from \'@/api/client\'
import { CvReviewCard } from \'@/components/candidates/CvReviewCard\'
import { toast } from \'react-hot-toast\'

interface PageProps { params: { id: string } }

export default function CvReviewPage({ params }: PageProps) {
  const jobId = (params as any).id
  const qc = useQueryClient()

  const { data: jobRes } = useQuery({
    queryKey: [\'job\', jobId],
    queryFn: () => api.get<any>(`/jobs/${jobId}`),
  })

  const { data: candidatesRes, isLoading } = useQuery({
    queryKey: [\'cv-review\', jobId],
    queryFn: () => api.get<any[]>(`/jobs/${jobId}/candidates`, { stage: \'evaluated\' }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/candidates/${id}/status`, { pipelineStage: stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [\'cv-review\', jobId] }); },
  })

  const job = jobRes?.data?.data
  const candidates = (candidatesRes?.data?.data || []).filter(
    (c: any) => (c.compositeScore || 0) >= 40 && (c.compositeScore || 0) < 75
  )

  const handleConfirm = (id: string) => {
    updateStatus.mutate({ id, stage: \'screening\' })
    toast.success(\'Candidate confirmed — WhatsApp screening will start\')
  }
  const handleReject = (id: string) => {
    updateStatus.mutate({ id, stage: \'rejected\' })
    toast.success(\'Candidate rejected\')
  }
  const handleShortlist = (id: string) => {
    updateStatus.mutate({ id, stage: \'shortlisted\' })
    toast.success(\'Candidate shortlisted directly\')
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: \'#0A3D2E\' }}>CV Review</h1>
        <p className="text-gray-500 mt-1">
          {job?.title} at {job?.hiringCompany} · Amber zone candidates (score 40–74)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{candidates.length}</div>
          <div className="text-xs text-amber-600 mt-1">Awaiting review</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {candidates.filter((c: any) => (c.dataTags as any)?.returningCandidate?.isReturning).length}
          </div>
          <div className="text-xs text-green-600 mt-1">Returning candidates</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-700">
            {candidates.filter((c: any) => c.authenticityFlag === \'high\' || c.authenticityFlag === \'medium\').length}
          </div>
          <div className="text-xs text-orange-600 mt-1">Integrity flags</div>
        </div>
      </div>

      {/* Batch actions */}
      {candidates.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => candidates.forEach((c: any) => handleConfirm(c.id))}
            className="text-xs px-4 py-2 rounded-lg font-medium text-white transition-all"
            style={{ background: \'#0A3D2E\' }}>
            Confirm all ({candidates.length}) → WhatsApp
          </button>
          <button
            onClick={() => candidates.forEach((c: any) => handleReject(c.id))}
            className="text-xs px-4 py-2 rounded-lg font-medium border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all">
            Reject all
          </button>
        </div>
      )}

      {/* Candidate list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: \'#C9A84C\', borderTopColor: \'transparent\' }} />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-medium">No candidates awaiting review</p>
          <p className="text-sm mt-1">All amber zone candidates have been processed</p>
        </div>
      ) : (
        candidates.map((candidate: any) => (
          <CvReviewCard
            key={candidate.id}
            candidate={candidate}
            jobCurrency={job?.currency}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onShortlist={handleShortlist}
          />
        ))
      )}
    </div>
  )
}
'''

with open(page_path, 'w') as f:
    f.write(page_content)
print(f"✅ CV Review page created")
