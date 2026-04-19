'use client'
import clsx from 'clsx'
import type { AiRecommendation, PipelineStage } from '@/types'

// Maps current pipelineStage → the "pending X" label shown when no
// recommendation exists yet for the next transition. Keeps UI honest about
// what signal the AI is waiting on.
const PENDING_LABEL: Partial<Record<PipelineStage | string, string>> = {
  applied:      'Pending screening',
  screening:    'Pending screening',
  evaluated:    'Pending screening',
  shortlisted:  'Pending interview invite',
  interviewing: 'Pending interview completion',
  offered:      'Pending feedback',
}

const REC_LABEL: Record<AiRecommendation, string> = {
  advance: '✅ AI: Advance',
  hold:    '⚠️ AI: Hold',
  reject:  '❌ AI: Reject',
}

const REC_CLASS: Record<AiRecommendation, string> = {
  advance: 'bg-green-50 text-green-700 border-green-200',
  hold:    'bg-amber-50 text-amber-700 border-amber-200',
  reject:  'bg-red-50 text-red-600 border-red-200',
}

interface Props {
  recommendation: AiRecommendation | null
  pipelineStage: PipelineStage | string
  size?: 'sm' | 'md'
}

export function AiRecommendationBadge({ recommendation, pipelineStage, size = 'sm' }: Props) {
  const base = clsx(
    'inline-flex items-center rounded font-medium border',
    size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1',
  )

  if (recommendation) {
    return <span className={clsx(base, REC_CLASS[recommendation])}>{REC_LABEL[recommendation]}</span>
  }

  const pending = PENDING_LABEL[pipelineStage]
  if (!pending) return null

  return (
    <span className={clsx(base, 'bg-gray-50 text-gray-500 border-gray-200')}>
      ⏳ {pending}
    </span>
  )
}
