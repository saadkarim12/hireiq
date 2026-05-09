'use client'
// src/app/(dashboard)/jobs/[id]/edit/page.tsx
//
// Hydrates the shared <JobWizard /> with an existing job and renders it in
// edit mode. Archived jobs are read-only — we redirect them back to the view
// screen with a toast rather than allowing the wizard to load.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { jobsApi } from '@/api/jobs'
import { JobWizard } from '@/components/jobs/JobWizard'
import { JOB_STATUS } from '@/lib/constants'

interface PageProps { params: { id: string } }

export default function EditJobPage({ params }: PageProps) {
  const id = (params as any).id
  const router = useRouter()

  const { data: job, isLoading, error } = useQuery({
    queryKey: ['job', id],
    queryFn:  () => jobsApi.get(id),
  })

  // Archived guard. Backend would also reject the PATCH, but redirecting up
  // front saves the recruiter from filling the wizard for nothing.
  useEffect(() => {
    if (job && job.status === JOB_STATUS.ARCHIVED) {
      toast.error('Archived jobs are read-only. Unarchive first to edit.')
      router.replace(`/jobs/${id}/view`)
    }
  }, [job, id, router])

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="skeleton h-8 w-1/3 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="card h-96" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="card py-16 text-center">
          <p className="text-base font-semibold text-gray-700">Job not found</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">It may have been deleted, or you don't have access.</p>
          <button onClick={() => router.push('/jobs')} className="btn-primary inline-flex">Back to jobs</button>
        </div>
      </div>
    )
  }

  if (job.status === JOB_STATUS.ARCHIVED) return null  // redirect in flight

  return <JobWizard mode="edit" initialJob={job} />
}
