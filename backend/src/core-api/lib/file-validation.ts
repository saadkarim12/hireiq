// Magic-byte file sniffing for public CV uploads. Don't trust client-supplied
// MIME type or filename extension — both are trivial to forge. We accept only
// PDF, DOCX, and legacy DOC, identified by the bytes at the start of the buffer.
// No external `file-type` dep (it's ESM-only and breaks ts-node CommonJS).

export type DetectedKind = 'pdf' | 'docx' | 'doc' | 'unknown'

export function detectFileKind(buffer: Buffer): DetectedKind {
  if (buffer.length < 8) return 'unknown'

  // PDF: starts with "%PDF" (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf'
  }

  // DOCX (and any Office Open XML): ZIP local-file header "PK\x03\x04".
  // We don't drill into the ZIP central directory to confirm a `word/`
  // entry — mammoth will fail-fast on non-DOCX zips, and the AI parse step
  // will reject anything that doesn't yield text. This keeps the gate cheap.
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'docx'
  }

  // Legacy DOC (OLE compound document): D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
    buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1
  ) {
    return 'doc'
  }

  return 'unknown'
}

export const ACCEPTED_MIME_BY_KIND: Record<Exclude<DetectedKind, 'unknown'>, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
}
