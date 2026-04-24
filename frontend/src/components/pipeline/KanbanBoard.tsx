'use client'
// src/components/pipeline/KanbanBoard.tsx
import { useState } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { CandidateCard } from './CandidateCard'
import type { CandidateSummary, PipelineStage, PipelineCounts } from '@/types'

interface KanbanBoardProps {
  stages: { key: PipelineStage; label: string; color: string; stages?: string[] }[]
  candidates: CandidateSummary[]
  pipelineCounts?: PipelineCounts | null
  onCandidateClick: (candidateId: string) => void
  onStageChange: (candidateId: string, newStage: PipelineStage) => void
}

export function KanbanBoard({ stages, candidates, pipelineCounts, onCandidateClick, onStageChange }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const candidatesByStage = stages.reduce((acc, stage) => {
    acc[stage.key] = candidates.filter(c => (stage as any).stages ? (stage as any).stages.includes(c.pipelineStage) : c.pipelineStage === stage.key)
    return acc
  }, {} as Record<PipelineStage, CandidateSummary[]>)

  const activeCandidate = activeId ? candidates.find(c => c.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)

    if (!over || active.id === over.id) return

    const candidateId = active.id as string
    const overId = over.id as string

    // 8.5.a — with closestCorners collision, dropping onto a column that
    // already has cards often picks one of those cards as `over` instead of
    // the column background. Map card → parent column so these drops land
    // instead of silently failing.
    let targetStage: PipelineStage | undefined
    if (stages.some(s => s.key === overId)) {
      // Dropped directly on a column
      targetStage = overId as PipelineStage
    } else {
      // Dropped on a candidate card — look up which column contains that card
      const overCard = candidates.find(c => c.id === overId)
      if (overCard) {
        const col = stages.find(s =>
          s.key === overCard.pipelineStage ||
          (s as any).stages?.includes(overCard.pipelineStage)
        )
        if (col) targetStage = col.key
      }
    }
    if (!targetStage) return

    const candidate = candidates.find(c => c.id === candidateId)
    if (!candidate) return

    // Find the column the dragged candidate currently belongs to (accounts for
    // multi-stage columns like 'applied' which covers applied/evaluated/screening).
    const currentCol = stages.find(s =>
      s.key === candidate.pipelineStage ||
      (s as any).stages?.includes(candidate.pipelineStage)
    )
    if (currentCol?.key === targetStage) return  // same column, no-op

    onStageChange(candidateId, targetStage)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-6 overflow-x-auto h-full" style={{ alignItems: 'flex-start' }}>
        {stages.map((stage) => (
          <SortableContext
            key={stage.key}
            items={candidatesByStage[stage.key]?.map(c => c.id) || []}
            strategy={verticalListSortingStrategy}
          >
            <KanbanColumn
              id={stage.key}
              label={stage.label}
              color={stage.color}
              count={pipelineCounts?.[stage.key as keyof PipelineCounts] as number || candidatesByStage[stage.key]?.length || 0}
              candidates={candidatesByStage[stage.key] || []}
              onCandidateClick={onCandidateClick}
              isOver={overId === stage.key}
            />
          </SortableContext>
        ))}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeCandidate && (
          <div className="rotate-2 opacity-90 shadow-xl">
            <CandidateCard
              candidate={activeCandidate}
              onClick={() => {}}
              isDragging
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
