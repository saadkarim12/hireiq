'use client'
// src/app/(dashboard)/talent-pool/page.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { candidatesApi } from '@/api/candidates'
import { TopBar } from '@/components/layout/TopBar'
import { ScoreBar } from '@/components/candidates/ScoreBadge'
import { PipelineStageBadge } from '@/components/candidates/PipelineStageBadge'
import { CandidatePanel } from '@/components/candidates/CandidatePanel'
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import type { RoleCategory, SeniorityLevel, Availability } from '@/types'
import clsx from 'clsx'

const ROLE_CATEGORIES: RoleCategory[] = [
  'Software Development', 'Finance & Accounting', 'Sales & BD',
  'HR & Talent', 'Marketing', 'Operations', 'Legal', 'Engineering', 'Other',
]

const SENIORITY_LEVELS: SeniorityLevel[] = ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Manager', 'Director']

const AVAILABILITY_OPTIONS: Availability[] = ['Immediate', '30 Days', '60 Days', '90 Days']

export default function TalentPoolPage() {
  const [search, setSearch] = useState('')
  const [roleCategory, setRoleCategory] = useState('')
  const [seniority, setSeniority] = useState('')
  const [availability, setAvailability] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['talent-pool', { q: search, roleCategory, seniority, availability }],
    queryFn: () => candidatesApi.search({
      q: search || undefined,
      roleCategory: roleCategory || undefined,
      seniority: seniority || undefined,
      availability: availability || undefined,
      limit: 50,
    }),
  })

  const candidates = data?.data || []
  const total = data?.meta?.total || candidates.length
  const hasFilters = !!(search || roleCategory || seniority || availability)

  const clearFilters = () => {
    setSearch('')
    setRoleCategory('')
    setSeniority('')
    setAvailability('')
  }

  return (
    <>
      <TopBar title="Talent Pool" subtitle="Search and re-engage past candidates" />
      <div className="p-6 space-y-5">

        {/* Search + Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, skill, company..."
              className="input pl-9"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx('btn-secondary gap-2', showFilters && 'bg-brand-navy text-white border-brand-navy')}
          >
            <FunnelIcon className="w-4 h-4" />
            Filters
            {hasFilters && <span className="w-2 h-2 rounded-full bg-brand-gold" />}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-gray-600">
              Clear all
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="card rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs">Role Category</label>
              <select value={roleCategory} onChange={(e) => setRoleCategory(e.target.value)} className="input text-sm">
                <option value="">All categories</option>
                {ROLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Seniority Level</label>
              <select value={seniority} onChange={(e) => setSeniority(e.target.value)} className="input text-sm">
                <option value="">All levels</option>
                {SENIORITY_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Availability</label>
              <select value={availability} onChange={(e) => setAvailability(e.target.value)} className="input text-sm">
                <option value="">Any availability</option>
                {AVAILABILITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading...' : `${total.toLocaleString()} candidates${hasFilters ? ' matching filters' : ' in pool'}`}
          </p>
        </div>

        {/* Candidates Table */}
        <div className="card rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-48 rounded" />
                    <div className="skeleton h-3 w-32 rounded" />
                  </div>
                  <div className="skeleton h-6 w-20 rounded-full" />
                  <div className="skeleton h-6 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm font-semibold text-gray-700">No candidates found</p>
              <p className="text-xs text-gray-400 mt-1">
                {hasFilters ? 'Try adjusting your filters' : 'Candidates appear here after they apply to your jobs'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Candidate', 'Current Role', 'Category', 'Availability', 'Score', 'Status', 'Applied For'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {candidates.map((c) => {
                  const initials = c.fullName
                    ? c.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                    : '??'
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCandidateId(c.id)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-brand-navy">{initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-blue transition-colors">
                              {c.fullName || 'Unknown'}
                            </p>
                            {c.yearsExperience !== null && (
                              <p className="text-xs text-gray-400">{c.yearsExperience}y exp</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 truncate max-w-40">{c.currentRole || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        {c.dataTags?.roleCategory ? (
                          <span className="text-xs font-medium text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full">
                            {c.dataTags.roleCategory}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {c.dataTags?.availability ? (
                          <span className={clsx(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            c.dataTags.availability === 'Immediate' ? 'bg-green-50 text-green-700' :
                            c.dataTags.availability === '30 Days' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-100 text-gray-500'
                          )}>
                            {c.dataTags.availability}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 w-32">
                        <ScoreBar score={c.compositeScore} />
                      </td>
                      <td className="px-4 py-3">
                        <PipelineStageBadge stage={c.pipelineStage} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 truncate max-w-32">{c.jobId}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedCandidateId && (
        <CandidatePanel
          candidateId={selectedCandidateId}
          onClose={() => setSelectedCandidateId(null)}
        />
      )}
    </>
  )
}
