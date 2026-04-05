#!/bin/bash
echo "🔨 Applying Phase 6b/6c/6d changes to ~/hireiq..."

# Backend: score-candidate with evidence
cat > ~/hireiq/backend/src/ai-engine/routes/score-candidate.ts << 'TSEOF'
import { Router } from 'express'
import { callClaudeWithTool } from '../claude-client'
import { prisma } from '../../shared/db'
import { logger } from '../../shared/logger'
import Anthropic from '@anthropic-ai/sdk'

export const scoreCandidateRoute = Router()

const SCORE_TOOLS_V2: Anthropic.Tool[] = [
  {
    name: 'score_candidate',
    description: 'Score candidate with per-criterion evidence',
    input_schema: {
      type: 'object' as const,
      properties: {
        commitmentScore:      { type: 'number' },
        cvMatchScore:         { type: 'number' },
        salaryFitScore:       { type: 'number' },
        compositeScore:       { type: 'number' },
        hardFilterPass:       { type: 'boolean' },
        hardFilterFailReason: { type: 'string' },
        authenticityFlag:     { type: 'string', enum: ['none','low','medium','high'] },
        parseConfidence:      { type: 'number', description: '0-100 how cleanly CV was parsed' },
        evidence: {
          type: 'object',
          properties: {
            experience: {
              type: 'object',
              properties: {
                found:    { type: 'boolean' },
                years:    { type: 'number' },
                evidence: { type: 'string' },
              }
            },
            mustHaveSkills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  skill:    { type: 'string' },
                  found:    { type: 'boolean' },
                  evidence: { type: 'string' },
                }
              }
            },
            salaryEvidence:     { type: 'string' },
            visaEvidence:       { type: 'string' },
            aiAlterationFlags:  { type: 'array', items: { type: 'string' } },
          }
        },
        dataTags: {
          type: 'object',
          properties: {
            seniorityLevel:     { type: 'string' },
            roleCategory:       { type: 'string' },
            languageCapability: { type: 'string' },
            availability:       { type: 'string' },
          }
        },
      },
      required: ['commitmentScore','cvMatchScore','salaryFitScore','compositeScore','hardFilterPass','dataTags','evidence','parseConfidence'],
    },
  },
]

scoreCandidateRoute.post('/score', async (req, res) => {
  const { candidateId, jobId } = req.body
  try {
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId }, include: { messages: true } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ])
    if (!candidate || !job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })

    const criteria = job.extractedCriteria as any
    const screeningAnswers = candidate.messages
      .filter(m => m.direction === 'inbound' && m.questionIndex !== null)
      .map(m => `Q${(m.questionIndex||0)+1}: ${m.content}`).join('\n')

    const scores = await callClaudeWithTool<any>(
      `You are a recruitment scoring engine for UAE and KSA.
Score objectively. Extract EXACT evidence from CV text for each criterion.
For mustHaveSkills: quote the exact CV phrase where found, or leave evidence empty.
parseConfidence: 0=garbled/table/image PDF, 100=clean plain text.
Flag AI-generated content: perfect JD keyword match, skills with no timeline support, generic achievement language.
Composite = (cvMatchScore*0.40) + (commitmentScore*0.40) + (salaryFitScore*0.20)`,
      `Score this candidate:
JOB: ${job.title} at ${job.hiringCompany} (${job.locationCountry})
Salary: ${job.currency} ${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}/month
Min experience: ${job.minExperienceYears} years
Required skills: ${job.requiredSkills.join(', ')}
Must-have: ${criteria?.mustHave?.join(', ')||'Not specified'}

CANDIDATE:
Role: ${candidate.currentRole||'Unknown'}
Experience: ${candidate.yearsExperience||'Unknown'} years
Salary expectation: ${candidate.salaryExpectation||'Not stated'}
Visa: ${candidate.visaStatus||'Unknown'}
CV skills: ${((candidate.cvStructured as any)?.skills||[]).join(', ')}
CV data: ${JSON.stringify(candidate.cvStructured||{}).slice(0,800)}

SCREENING ANSWERS:
${screeningAnswers||'None yet'}`,
      SCORE_TOOLS_V2,
      'score_candidate'
    )

    const returningInfo = await checkReturningCandidate(candidateId, jobId, candidate.agencyId)

    const updated = await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        commitmentScore:      scores.commitmentScore,
        cvMatchScore:         scores.cvMatchScore,
        salaryFitScore:       scores.salaryFitScore,
        compositeScore:       scores.compositeScore,
        hardFilterPass:       scores.hardFilterPass,
        hardFilterFailReason: scores.hardFilterFailReason||null,
        authenticityFlag:     scores.authenticityFlag||'none',
        dataTags: {
          ...(scores.dataTags||{}),
          evidence:           scores.evidence||{},
          parseConfidence:    scores.parseConfidence||75,
          returningCandidate: returningInfo,
        },
        pipelineStage: 'evaluated',
      },
    })

    if (scores.hardFilterPass && scores.compositeScore >= 65) {
      const count = await prisma.candidate.count({ where: { jobId, pipelineStage: 'shortlisted' } })
      if (count < 20) {
        await prisma.candidate.update({ where: { id: candidateId }, data: { pipelineStage: 'shortlisted', shortlistedAt: new Date() } })
      }
    }

    logger.info(`Scored ${candidateId}: composite=${scores.compositeScore} parseConfidence=${scores.parseConfidence}`)
    res.json({ success: true, data: { ...scores, returningCandidate: returningInfo } })
  } catch (err: any) {
    logger.error('Score error', { err: err.message })
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: err.message } })
  }
})

async function checkReturningCandidate(candidateId: string, jobId: string, agencyId: string) {
  try {
    const current = await prisma.candidate.findUnique({ where: { id: candidateId } })
    if (!current) return null
    const whereClause: any[] = [{ waNumberHash: current.waNumberHash }]
    if (current.email) whereClause.push({ email: current.email })
    const previous = await prisma.candidate.findMany({
      where: { agencyId, id: { not: candidateId }, jobId: { not: jobId }, OR: whereClause },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    if (previous.length === 0) return null
    const prev = previous[0]
    const changePercent = calcDiff(JSON.stringify(prev.cvStructured||{}), JSON.stringify(current.cvStructured||{}))
    return {
      isReturning: true,
      previousJobTitle: (prev.job as any)?.title||'Unknown',
      previousDate: prev.createdAt.toISOString().split('T')[0],
      previousStatus: prev.pipelineStage,
      cvChangePercent: changePercent,
      previousCount: previous.length,
    }
  } catch { return null }
}

function calcDiff(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  if (wa.size === 0) return 0
  let changed = 0
  wb.forEach(w => { if (!wa.has(w)) changed++ })
  return Math.min(100, Math.round((changed / Math.max(wa.size, wb.size)) * 100))
}
TSEOF

echo "✅ score-candidate.ts updated"

# Update start.sh with token auto-refresh
cat > ~/hireiq/start.sh << 'STARTEOF'
#!/bin/bash
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
echo "🚀 Starting HireIQ..."
docker start hireiq-postgres 2>/dev/null && echo "✅ PostgreSQL" || echo "✅ PostgreSQL already running"
sleep 2
echo "🔑 Refreshing token..."
python3 -c "
import subprocess,json,os,re
r=subprocess.run(['curl','-s','-X','POST','http://localhost:3001/api/v1/auth/dev-login','-H','Content-Type: application/json','-d','{\"email\":\"admin@saltrecruitment.ae\"}'],capture_output=True,text=True)
try:
    token=json.loads(r.stdout)['data']['accessToken']
    path=os.path.expanduser('~/hireiq/frontend/src/api/client.ts')
    content=open(path).read()
    content=re.sub(r\"const DEV_TOKEN = '.*'\",f\"const DEV_TOKEN = '{token}'\",content)
    open(path,'w').write(content)
    print('✅ Token refreshed')
except: print('⚠️  Token refresh after backend starts')
"
echo ""
echo "🔧 Starting backend services..."
echo "   API :3001  |  AI :3002  |  WA :3003  |  Sched :3004"
echo "📱  WhatsApp simulator → http://localhost:3003/mock"
echo "🖥️   Frontend (new tab) → cd ~/hireiq/frontend && npm run dev"
echo ""
cd ~/hireiq/backend && npx concurrently \
  --names "API,AI,WA,SCHED" \
  --prefix-colors "cyan,magenta,green,yellow" \
  "npx ts-node src/core-api/index.ts" \
  "npx ts-node src/ai-engine/index.ts" \
  "npx ts-node src/whatsapp-service/index.ts" \
  "npx ts-node src/scheduler/index.ts"
STARTEOF
chmod +x ~/hireiq/start.sh
echo "✅ start.sh updated"

echo ""
echo "✅ Phase 6b/6c/6d backend changes applied!"
echo ""
echo "Next: restart backend and frontend"
echo "  1. Stop start.sh (Ctrl+C)"
echo "  2. Run: ~/hireiq/start.sh"
echo "  3. In new tab: cd ~/hireiq/frontend && npm run dev"
