'use client'
// src/app/(dashboard)/analytics/page.tsx
// Analytics v1 — owner-facing performance rollup.
// Period + optional jobId drive everything EXCEPT Active Jobs (always agency-wide current state).

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { analyticsApi } from '@/api/analytics'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const PERIODS = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '365d', value: 365 },
]

const STAGE_LABEL: Record<string, string> = {
  applied: 'Applied', l1: 'L1 — CV Screened', l2: 'L2 — WA Screened',
  l3: 'L3 — Interviewed', final: 'Final Shortlist',
}

// Threshold colours for "Time at Stage" bars.
//   < 3 days  → green (healthy)
//   3-7 days  → amber (borderline)
//   7+ days   → red (bottleneck)
function timeColor(avgDays: number | null): string {
  if (avgDays == null) return '#D1D5DB'
  if (avgDays < 3)     return '#166534'
  if (avgDays < 7)     return '#C9A84C'
  return '#B91C1C'
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState(30)
  const [jobId, setJobId] = useState<string>('')

  const { data: jobsRes } = useQuery({
    queryKey: ['analytics-jobs-list'],
    queryFn: () => api.get<any[]>('/jobs'),
  })
  const jobs: any[] = jobsRes?.data?.data || []

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', period, jobId || null],
    queryFn: () => analyticsApi.get(period, jobId || undefined),
    refetchInterval: 60_000,
  })

  const kpis = data?.kpis
  const funnel = data?.funnel || []
  const appliedCount = funnel[0]?.count ?? 0
  const funnelData = funnel.map(f => ({
    ...f,
    label: STAGE_LABEL[f.stage],
    pctOfApplied: appliedCount > 0 ? Math.round((f.count / appliedCount) * 100) : 0,
  }))

  const timeData = (data?.avgTimeAtStage || []).map(t => ({
    label: STAGE_LABEL[t.stage],
    avgDays: t.avgDays ?? 0,
    sample: t.sample,
    color: timeColor(t.avgDays),
    hasData: t.avgDays != null && t.sample > 0,
  }))

  const totalTransitions = data?.meta?.totalTransitions ?? 0
  const sourceRows = data?.sourcePerformance || []

  return (
    <div className="max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0A3D2E' }}>Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">
            {jobId ? (jobs.find((j: any) => j.id === jobId)?.title || 'Selected job') : 'Agency-wide performance'}
            {' · '}last {period} days
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl border border-gray-200 bg-white">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={period === p.value
                  ? { background: '#C9A84C', color: '#0A3D2E' }
                  : { color: '#6B7280' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <select
            value={jobId}
            onChange={e => setJobId(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-navy"
          >
            <option value="">All jobs (aggregate)</option>
            {jobs.map((j: any) => (
              <option key={j.id} value={j.id}>
                {j.title}{j.hiringCompany ? ` — ${j.hiringCompany}` : ''}
                {j.createdAt ? ` · ${new Date(j.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── KPI Row (2x2 mobile → 1x4 desktop) ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon="💼"
          value={kpis?.activeJobs ?? '—'}
          label="Active Jobs"
          sub="Open roles right now"
          color="#0A3D2E"
          bg="#E8F5EE"
          loading={isLoading}
        />
        <KpiCard
          icon="⏱"
          value={kpis?.avgTimeToFillDays != null ? `${kpis.avgTimeToFillDays}d` : '—'}
          label="Avg Time to Fill"
          sub="Application → hired"
          color="#C2410C"
          bg="#FFF7ED"
          loading={isLoading}
        />
        <KpiCard
          icon="📊"
          value={kpis != null ? `${kpis.hireRate}%` : '—'}
          label="Hire Rate"
          sub="Hired / total in period"
          color="#7C3AED"
          bg="#F5F3FF"
          loading={isLoading}
        />
        <CostPerHireCard />
      </div>

      {/* ── Charts row (stacked on mobile, side-by-side lg+) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Funnel */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Pipeline Funnel</h2>
            <p className="text-xs text-gray-400 mt-0.5">Count per stage + % of Applied + drop-off</p>
          </div>

          {appliedCount < 5 ? (
            <EmptyState message="Need at least 5 candidates in pipeline to show funnel" />
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value: any, _name: any, p: any) =>
                        [`${value} candidates (${p?.payload?.pctOfApplied}% of Applied)`, 'Count']
                      }
                      cursor={{ fill: 'rgba(10,61,46,0.05)' }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {funnelData.map((_, i) => {
                        const palette = ['#64748B', '#C9A84C', '#1D4ED8', '#7C3AED', '#166534']
                        return <Cell key={i} fill={palette[i] || '#64748B'} />
                      })}
                      <LabelList
                        dataKey="pctOfApplied"
                        position="top"
                        formatter={(v: number) => `${v}%`}
                        fill="#6B7280"
                        fontSize={11}
                        fontWeight={600}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-5 gap-2 mt-2 text-[11px] font-medium text-gray-500">
                {funnelData.map((f, i) => (
                  <div key={f.stage} className="text-center">
                    {i > 0 && f.dropToNext > 0 ? (
                      <span className="text-red-500">← -{f.dropToNext}% drop</span>
                    ) : i === 0 ? (
                      <span>100% baseline</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Time at Each Stage */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Avg Time at Each Stage</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: '#166534' }} />&lt;3d healthy
              <span className="inline-block w-2 h-2 rounded-full ml-3 mr-1 align-middle" style={{ background: '#C9A84C' }} />3-7d borderline
              <span className="inline-block w-2 h-2 rounded-full ml-3 mr-1 align-middle" style={{ background: '#B91C1C' }} />7d+ bottleneck
            </p>
          </div>

          {totalTransitions < 3 ? (
            <EmptyState message="Need at least 3 completed stage transitions to show timing" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeData} layout="vertical" margin={{ top: 8, right: 28, left: 8, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip
                    formatter={(value: any, _n: any, p: any) => [`${value}d (n=${p?.payload?.sample})`, 'Avg']}
                    cursor={{ fill: 'rgba(10,61,46,0.05)' }}
                  />
                  <Bar dataKey="avgDays" radius={[0, 6, 6, 0]}>
                    {timeData.map((t, i) => (
                      <Cell key={i} fill={t.hasData ? t.color : '#E5E7EB'} />
                    ))}
                    <LabelList
                      dataKey="avgDays"
                      position="right"
                      formatter={(v: number) => v > 0 ? `${v}d` : '—'}
                      fill="#374151"
                      fontSize={11}
                      fontWeight={600}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Source Performance Table ───────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Source Performance</h2>
          <p className="text-xs text-gray-400 mt-0.5">Conversion + score quality by sourcing channel</p>
        </div>

        {sourceRows.length < 2 ? (
          <EmptyState message="Need candidates from multiple sources to compare" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4 text-right">Candidates</th>
                  <th className="py-2 pr-4 text-right">Hires</th>
                  <th className="py-2 pr-4 text-right">Conversion</th>
                  <th className="py-2 pr-4 text-right">Avg Composite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sourceRows.map(row => (
                  <tr key={row.source} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-4 font-medium text-gray-800 capitalize">
                      {row.source.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">{row.candidates}</td>
                    <td className="py-3 pr-4 text-right text-gray-700">{row.hires}</td>
                    <td className="py-3 pr-4 text-right">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: row.conversionRate >= 10 ? '#DCFCE7' : row.conversionRate > 0 ? '#FEF3C7' : '#F3F4F6',
                          color: row.conversionRate >= 10 ? '#166534' : row.conversionRate > 0 ? '#92400E' : '#6B7280',
                        }}
                      >
                        {row.conversionRate}%
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.avgComposite != null ? (
                        <span className="font-semibold" style={{ color: row.avgComposite >= 75 ? '#166534' : row.avgComposite >= 55 ? '#92400E' : '#991B1B' }}>
                          {row.avgComposite}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recruiter Performance (stub) ───────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#0A3D2E' }}>Recruiter Performance</h2>
            <p className="text-xs text-gray-400 mt-0.5">Decisions + throughput by recruiter</p>
          </div>
          <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full font-semibold" style={{ background: '#E0E7FF', color: '#3730A3' }}>
            Phase 7
          </span>
        </div>
        <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
          <p className="text-sm text-gray-500">Per-recruiter attribution requires user action tracking.</p>
          <p className="text-xs text-gray-400 mt-1">Available when multi-user agencies ship in Phase 7.</p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function KpiCard({ icon, value, label, sub, color, bg, loading }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: bg }}>
          {icon}
        </div>
        <span className="text-3xl font-bold" style={{ color }}>
          {loading ? <span className="inline-block w-12 h-8 rounded skeleton" /> : value}
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function CostPerHireCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5"
      title="Phase 7 — integrate with your billing system to track cost per hire">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#F3F4F6' }}>
          💰
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full font-semibold" style={{ background: '#E0E7FF', color: '#3730A3' }}>
          Coming Soon
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-800">Cost per Hire</p>
      <p className="text-xs text-gray-400 mt-0.5">Phase 7 — integrate billing</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
      <p className="text-sm text-gray-500">{message}</p>
      <p className="text-xs text-gray-400 mt-1">Try widening the period or clearing the job filter</p>
    </div>
  )
}
