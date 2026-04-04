'use client'
// src/components/candidates/PipelineStageBadge.tsx
import type { PipelineStage } from '@/types'
import clsx from 'clsx'

const stageConfig: Record<PipelineStage, { label: string; bg: string; text: string }> = {
  applied:      { label: 'Applied',      bg: 'bg-slate-100',   text: 'text-slate-600' },
  screening:    { label: 'Screening',    bg: 'bg-blue-50',     text: 'text-blue-600' },
  cv_received:  { label: 'CV Received',  bg: 'bg-indigo-50',   text: 'text-indigo-600' },
  evaluated:    { label: 'Evaluated',    bg: 'bg-violet-50',   text: 'text-violet-600' },
  shortlisted:  { label: 'Shortlisted',  bg: 'bg-amber-50',    text: 'text-amber-700' },
  interviewing: { label: 'Interviewing', bg: 'bg-purple-50',   text: 'text-purple-700' },
  offered:      { label: 'Offered',      bg: 'bg-cyan-50',     text: 'text-cyan-700' },
  hired:        { label: 'Hired ✓',      bg: 'bg-green-50',    text: 'text-green-700' },
  rejected:     { label: 'Rejected',     bg: 'bg-red-50',      text: 'text-red-600' },
  withdrawn:    { label: 'Withdrawn',    bg: 'bg-gray-100',    text: 'text-gray-500' },
  held:         { label: 'On Hold',      bg: 'bg-orange-50',   text: 'text-orange-600' },
}

export function PipelineStageBadge({ stage }: { stage: PipelineStage }) {
  const config = stageConfig[stage] || stageConfig.applied
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', config.bg, config.text)}>
      {config.label}
    </span>
  )
}
