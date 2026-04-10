// src/ai-engine/index.ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { logger } from '../shared/logger'
import { processJdRoute }       from './routes/process-jd'
import { scoreCandidateRoute }  from './routes/score-candidate'
import { parseCvRoute }         from './routes/parse-cv'
import { generateSummaryRoute } from './routes/generate-summary'
import { extractTextRoute }     from './routes/extract-text'
import { generateJdRoute }      from './routes/generate-jd'
import { evaluateAnswerRoute }  from './routes/evaluate-answer'

const app  = express()
const PORT = process.env.AI_ENGINE_PORT || 3002

app.use(cors())
app.use(express.json({ limit: '20mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai-engine' }))

app.use('/api/v1/ai', processJdRoute)
app.use('/api/v1/ai', scoreCandidateRoute)
app.use('/api/v1/ai', parseCvRoute)
app.use('/api/v1/ai', generateSummaryRoute)
app.use('/api/v1/ai', extractTextRoute)
app.use('/api/v1/ai', generateJdRoute)
app.use('/api/v1/ai', evaluateAnswerRoute)

app.listen(PORT, () => logger.info(`🤖 AI Engine running on http://localhost:${PORT}`))

export default app
