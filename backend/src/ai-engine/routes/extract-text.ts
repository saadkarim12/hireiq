import { Router, Request, Response } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

export const extractTextRoute = Router()

extractTextRoute.post('/extract-text', async (req: Request, res: Response) => {
  const { base64, mimeType, filename } = req.body
  if (!base64) return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } })

  try {
    const buffer = Buffer.from(base64, 'base64')
    let text = ''

    if (mimeType === 'application/pdf') {
      // Use a unique tmp filename — under parallel uploads, Date.now() can collide
      // and cause two requests to write/read/unlink the same file mid-flight.
      const tmpFile = path.join(os.tmpdir(), `cv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.pdf`)
      await fs.promises.writeFile(tmpFile, buffer)

      try {
        // Async exec — execSync blocked the event loop and serialized parallel uploads.
        const { stdout } = await execFileAsync('pdftotext', [tmpFile, '-'], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 })
        text = stdout
      } catch {
        try {
          const { stdout } = await execFileAsync('strings', [tmpFile], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 })
          text = stdout
        } catch {
          text = buffer.toString('latin1')
            .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
            .replace(/\s{3,}/g, ' ')
        }
      }

      try { await fs.promises.unlink(tmpFile) } catch {}

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
