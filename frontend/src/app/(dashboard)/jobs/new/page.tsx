'use client'
// src/app/(dashboard)/jobs/new/page.tsx
//
// Thin wrapper around the shared <JobWizard /> component. All wizard logic
// lives in components/jobs/JobWizard.tsx — this file only declares the route.
import { JobWizard } from '@/components/jobs/JobWizard'

export default function NewJobPage() {
  return <JobWizard mode="create" />
}
