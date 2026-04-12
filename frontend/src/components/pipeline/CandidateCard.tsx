'use client'
// src/components/pipeline/CandidateCard.tsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ScoreBar } from '@/components/candidates/ScoreBadge'
import { formatDistanceToNow } from 'date-fns'
import type { CandidateSummary } from '@/types'
import clsx from 'clsx'

interface CandidateCardProps {
  candidate: CandidateSummary
  onClick: () => void
  isDragging?: boolean
}

const AVAILABILITY_COLORS: Record<string, string> = {
  'Immediate':   'bg-green-50 text-green-700',
  '30 Days':     'bg-blue-50 text-blue-700',
  '60 Days':     'bg-amber-50 text-amber-700',
  '90 Days':     'bg-orange-50 text-orange-700',
  '90+ Days':    'bg-red-50 text-red-600',
}

const FLAG_COLORS: Record<string, string> = {
  none:   '',
  low:    'border-l-4 border-l-amber-300',
  medium: 'border-l-4 border-l-orange-400',
  high:   'border-l-4 border-l-red-500',
}

export function CandidateCard({ candidate, onClick, isDragging }: CandidateCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: candidate.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  }

  const initials = candidate.fullName
    ? candidate.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  const availability = candidate.dataTags?.availability
  const seniorityLevel = candidate.dataTags?.seniorityLevel

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'bg-white rounded-lg border border-gray-200 p-3 cursor-pointer',
        'hover:border-brand-blue/40 hover:shadow-card-hover transition-all duration-150 group',
        'select-none',
        FLAG_COLORS[candidate.authenticityFlag] || '',
        isDragging && 'shadow-xl border-brand-blue/20'
      )}
    >
      {/* Top: Avatar + Name + Score */}
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className="w-8 h-8 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-brand-navy">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-blue transition-colors">
            {candidate.fullName || 'Unknown Candidate'}
          </p>
          {candidate.currentRole && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{candidate.currentRole}</p>
          )}
        </div>
        {(candidate.scores?.compositeScore ?? candidate.compositeScore) !== null && (
          <div className={clsx(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
            (candidate.scores?.compositeScore ?? candidate.compositeScore) >= 80 ? 'bg-green-50 text-green-700' :
            (candidate.scores?.compositeScore ?? candidate.compositeScore) >= 60 ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-600'
          )}>
            {(candidate.scores?.compositeScore ?? candidate.compositeScore)}
          </div>
        )}
      </div>

      {/* Score bar */}
      {(candidate.scores?.compositeScore ?? candidate.compositeScore) !== null && (
        <div className="mb-2.5">
          <ScoreBar score={(candidate.scores?.compositeScore ?? candidate.compositeScore)} />
        </div>
      )}

      {/* Tags row */}
      <div className="flex flex-wrap gap-1 mb-2">
        {seniorityLevel && (
          <span className="text-xs px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy rounded font-medium">
            {seniorityLevel}
          </span>
        )}
        {availability && AVAILABILITY_COLORS[availability] && (
          <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', AVAILABILITY_COLORS[availability])}>
            {availability}
          </span>
        )}
        {candidate.authenticityFlag && candidate.authenticityFlag !== 'none' && (
          <span className="text-xs px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded font-medium">
            ⚠️ AI-polished
          </span>
        )}
      </div>

      {/* Footer: time */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {formatDistanceToNow(new Date(candidate.createdAt), { addSuffix: true })}
        </span>
        {(candidate.scores?.[salaryFitScore] ?? (candidate as any).salaryFitScore) !== null && (candidate.scores?.[salaryFitScore] ?? (candidate as any).salaryFitScore) < 50 && (
          <span className="text-xs text-red-500 font-medium">💰 Salary gap</span>
        )}
      </div>
    </div>
  )
}
