'use client'
// src/components/candidates/ScoreBadge.tsx
import clsx from 'clsx'

interface ScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  label?: string
}

function getScoreColor(score: number | null) {
  if (score === null) return { bg: 'bg-gray-100', text: 'text-gray-400', ring: 'ring-gray-200' }
  if (score >= 80) return { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' }
  if (score >= 60) return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' }
  return { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-200' }
}

const sizeMap = {
  sm:  { badge: 'w-8 h-8 text-xs', label: 'text-xs' },
  md:  { badge: 'w-12 h-12 text-sm font-bold', label: 'text-xs' },
  lg:  { badge: 'w-16 h-16 text-xl font-bold', label: 'text-sm' },
}

export function ScoreBadge({ score, size = 'md', showLabel, label }: ScoreBadgeProps) {
  const colors = getScoreColor(score)
  const sizes = sizeMap[size]

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={clsx(
        'rounded-full flex items-center justify-center ring-2 font-semibold',
        colors.bg, colors.text, colors.ring, sizes.badge
      )}>
        {score !== null ? score : '—'}
      </div>
      {showLabel && label && (
        <span className={clsx('text-gray-400', sizes.label)}>{label}</span>
      )}
    </div>
  )
}

// Inline score bar for tables
export function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-300 text-sm">—</span>
  const colors = getScoreColor(score)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-16">
        <div
          className={clsx('h-full rounded-full transition-all', {
            'bg-green-500': score >= 80,
            'bg-amber-400': score >= 60 && score < 80,
            'bg-red-400': score < 60,
          })}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={clsx('text-xs font-semibold tabular-nums w-7 text-right', colors.text)}>
        {score}
      </span>
    </div>
  )
}
