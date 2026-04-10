import { Router, Request, Response } from 'express'
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const extractTextRoute = Router()

extractTextRoute.post('/extract-text', async (req: Request, res: Response) => {
  const { base64, mimeType, filename } = req.body
  if (!base64) return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } })

  try {
    const buffer = Buffer.from(base64, 'base64')
    let text = ''

    if (mimeType === 'application/pdf') {
      // Write to temp file and extract with pdftotext if available, else use strings command
      const tmpFile = path.join(os.tmpdir(), `cv_${Date.now()}.pdf`)
      fs.writeFileSync(tmpFile, buffer)
      
      try {
        // Try pdftotext first (most accurate)
        text = execSync(`pdftotext "${tmpFile}" -`, { timeout: 15000 }).toString()
      } catch {
        try {
          // Fallback: strings command to extract readable text from PDF
          text = execSync(`strings "${tmpFile}"`, { timeout: 10000 }).toString()
        } catch {
          // Last resort: decode buffer and clean
          text = buffer.toString('latin1')
            .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
            .replace(/\s{3,}/g, ' ')
        }
      }
      
      try { fs.unlinkSync(tmpFile) } catch {}
      
    } else {
      // Word documents: decode buffer directly
      text = buffer.toString('utf-8', 0, 50000)
        .replace(/[^\x20-\x7E\n\r\t\u0600-\u06FF]/g, ' ')
        .replace(/\s{3,}/g, ' ')
        .trim()
    }

    // Clean up extracted text
    text = text
      .replace(/\x00/g, '')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      .replace(/\s{4,}/g, '\n')
      .trim()
      .slice(0, 50000) // Max 50K chars

    res.json({ success: true, data: { text, filename, charCount: text.length } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EXTRACT_ERROR', message: err.message } })
  }
})
