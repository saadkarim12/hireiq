'use client'
// src/components/dashboard/KpiCard.tsx
import clsx from 'clsx'

interface KpiCardProps {
  title: string
  value: number
  subtitle: string
  icon: React.ReactNode
  color: 'blue' | 'gold' | 'green' | 'purple' | 'red'
  isLoading?: boolean
  highlight?: boolean
  trend?: { value: number; label: string }
}

const colorMap = {
  blue:   { bg: 'bg-brand-blue/10', text: 'text-brand-blue', border: 'border-brand-blue/20', icon: 'text-brand-blue' },
  gold:   { bg: 'bg-brand-gold/10', text: 'text-brand-gold-dark', border: 'border-brand-gold/30', icon: 'text-brand-gold' },
  green:  { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: 'text-green-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: 'text-purple-600' },
  red:    { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-600' },
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
  isLoading,
  highlight,
  trend,
}: KpiCardProps) {
  const colors = colorMap[color]

  return (
    <div
      className={clsx(
        'card rounded-xl p-5 transition-all duration-200',
        highlight && 'ring-2 ring-brand-gold ring-offset-2'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('p-2 rounded-lg', colors.bg)}>
          <div className={colors.icon}>{icon}</div>
        </div>
        {highlight && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-gold text-brand-navy">
            Action
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-8 w-16 rounded" />
          <div className="skeleton h-3 w-28 rounded" />
        </div>
      ) : (
        <>
          <div className="text-3xl font-bold text-brand-navy tabular-nums">
            {value.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">{title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>
          {trend && (
            <div className={clsx(
              'text-xs font-semibold mt-2',
              trend.value >= 0 ? 'text-green-600' : 'text-red-500'
            )}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </div>
          )}
        </>
      )}
    </div>
  )
}
