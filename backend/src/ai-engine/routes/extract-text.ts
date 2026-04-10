import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'

export const extractTextRoute = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

extractTextRoute.post('/extract-text', async (req: Request, res: Response) => {
  const { base64, mimeType, filename } = req.body
  if (!base64) return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: mimeType || 'application/pdf', data: base64 },
          } as any,
          {
            type: 'text',
            text: 'Extract ALL text from this CV/resume document exactly as it appears. Include name, contact details, work experience, education, skills, certifications. Return plain text only — no formatting, no commentary.',
          },
        ],
      }],
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('\n')

    res.json({ success: true, data: { text, filename, charCount: text.length } })
  } catch (err: any) {
    // Fallback: return base64 decoded as text for Word docs
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8', 0, 8000)
        .replace(/[^\x20-\x7E\n\r\t\u0600-\u06FF]/g, ' ')
        .replace(/\s{3,}/g, ' ')
        .trim()
      res.json({ success: true, data: { text: decoded, filename, charCount: decoded.length, fallback: true } })
    } catch {
      res.status(500).json({ success: false, error: { code: 'EXTRACT_ERROR', message: err.message } })
    }
  }
})
