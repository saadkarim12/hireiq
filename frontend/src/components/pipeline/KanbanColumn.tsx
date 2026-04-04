'use client'
// src/components/pipeline/KanbanColumn.tsx
import { useDroppable } from '@dnd-kit/core'
import { CandidateCard } from './CandidateCard'
import type { CandidateSummary, PipelineStage } from '@/types'
import clsx from 'clsx'

interface KanbanColumnProps {
  id: PipelineStage
  label: string
  color: string
  count: number
  candidates: CandidateSummary[]
  onCandidateClick: (id: string) => void
  isOver?: boolean
}

export function KanbanColumn({
  id, label, color, count, candidates, onCandidateClick, isOver
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <div
      id={`column-${id}`}
      ref={setNodeRef}
      className={clsx(
        'flex-shrink-0 w-72 flex flex-col rounded-xl border-t-2 bg-gray-50 transition-all duration-150',
        color,
        isOver && 'bg-brand-blue/5 ring-2 ring-brand-blue/30'
      )}
      style={{ minHeight: '200px', maxHeight: 'calc(100vh - 220px)' }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className={clsx(
          'text-xs font-bold px-2 py-0.5 rounded-full',
          count > 0 ? 'bg-brand-navy text-white' : 'bg-gray-200 text-gray-400'
        )}>
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {candidates.length === 0 ? (
          <div className={clsx(
            'flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-gray-300 transition-colors',
            isOver ? 'border-brand-blue text-brand-blue' : 'border-gray-200'
          )}>
            {isOver ? 'Drop here' : 'No candidates'}
          </div>
        ) : (
          candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onClick={() => onCandidateClick(candidate.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
