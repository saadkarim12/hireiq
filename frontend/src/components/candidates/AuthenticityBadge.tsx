'use client'
// src/components/candidates/AuthenticityBadge.tsx
//
// CV-fabrication banding badge. Surfaces the weighted authenticityScore (0-100)
// as a banded chip — Authentic / Review / Likely Fabricated. AuthenticityBreakdown
// is the per-signal table behind the click-to-expand drawer section.

import { useState } from 'react'
import clsx from 'clsx'
import type { AuthenticityBand, AuthenticityBreakdown } from '@/types'

const BAND_STYLES: Record<AuthenticityBand, { label: string; bg: string; text: string; ring: string; emoji: string }> = {
  authentic:   { label: 'Authentic',         bg: 'bg-green-50',  text: 'text-green-700',  ring: 'ring-green-200',  emoji: '🟢' },
  review:      { label: 'Review',            bg: 'bg-amber-50',  text: 'text-amber-700',  ring: 'ring-amber-200',  emoji: '🟡' },
  fabricated:  { label: 'Likely Fabricated', bg: 'bg-red-50',    text: 'text-red-700',    ring: 'ring-red-200',    emoji: '🔴' },
}

export function AuthenticityBadge({
  band, score, size = 'sm', dotOnly = false, className,
}: {
  band:      AuthenticityBand | null | undefined
  score?:    number | null
  size?:     'sm' | 'md'
  /** Compact dot only — used on kanban cards / inbox rows where space is tight. */
  dotOnly?:  boolean
  className?: string
}) {
  if (!band) return null
  const style = BAND_STYLES[band]
  if (!style) return null

  if (dotOnly) {
    return (
      <span
        title={`Authenticity: ${style.label}${score != null ? ` (${score}/100)` : ''}`}
        className={clsx('inline-flex items-center gap-1 text-xs font-medium', style.text, className)}
      >
        <span aria-hidden>{style.emoji}</span>
        <span>{style.label}</span>
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full ring-1 font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        style.bg, style.text, style.ring, className,
      )}
    >
      <span aria-hidden>{style.emoji}</span>
      <span>{style.label}</span>
      {score != null && <span className="tabular-nums opacity-70">{score}/100</span>}
    </span>
  )
}

// ── Per-signal breakdown card — expandable, lives inside CandidatePanel ─────
export function AuthenticityBreakdownCard({ data }: { data: AuthenticityBreakdown }) {
  const [open, setOpen] = useState(false)
  const style = BAND_STYLES[data.band]

  // One-line summary line for the collapsed state. Prefer Claude's topConcerns
  // (already trimmed to the names of <60 scorers). Fall back to the band copy.
  const summary = data.topConcerns?.length
    ? `Top concerns: ${data.topConcerns.join(', ')}`
    : data.band === 'authentic'
      ? 'No authenticity concerns detected'
      : 'Open for per-signal breakdown'

  return (
    <div className="mt-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AuthenticityBadge band={data.band} score={data.score} size="sm" />
          <span className="text-xs text-gray-600 truncate">{summary}</span>
        </div>
        <span className="text-gray-400 text-xs flex-shrink-0" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className={clsx('px-3 pb-3 pt-1 border-t', style?.ring || 'border-gray-100')}>
          {data.rationale && (
            <p className="text-xs text-gray-600 mb-3 leading-relaxed">{data.rationale}</p>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-[10px] uppercase tracking-wide">
                <th className="text-left font-medium pb-1.5">Signal</th>
                <th className="text-right font-medium pb-1.5 w-14">Weight</th>
                <th className="text-right font-medium pb-1.5 w-14">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.signals.map(sig => (
                <tr key={sig.id} className="border-t border-gray-100 align-top">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium text-gray-800">{sig.name}</div>
                    {sig.finding && <div className="text-gray-500 text-[11px] leading-snug mt-0.5">{sig.finding}</div>}
                  </td>
                  <td className="py-1.5 text-right text-gray-500 tabular-nums">{Math.round(sig.weight * 100)}%</td>
                  <td className="py-1.5 text-right">
                    <span
                      className={clsx(
                        'inline-block px-1.5 py-0.5 rounded font-semibold tabular-nums',
                        sig.score >= 75 && 'bg-green-50 text-green-700',
                        sig.score >= 50 && sig.score < 75 && 'bg-amber-50 text-amber-700',
                        sig.score < 50  && 'bg-red-50 text-red-700',
                      )}
                    >
                      {sig.score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                <td className="pt-2">Weighted total</td>
                <td className="pt-2 text-right text-gray-400 text-[11px]">100%</td>
                <td className="pt-2 text-right tabular-nums">{data.score}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
