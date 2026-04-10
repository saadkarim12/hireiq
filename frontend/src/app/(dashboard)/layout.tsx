'use client'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <meta name="dev-token" content="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkYTI2NGU5Mi04OTkzLTRkZmUtODU3OS1lZjQzZWU5ZWI4OWMiLCJhZ2VuY3lJZCI6ImYwMTRjODg2LWYyYWMtNGQ0OC04OTdjLTAwNzJhYjYzZjcwMCIsInJvbGUiOiJhZ2VuY3lfYWRtaW4iLCJlbWFpbCI6ImRldkBoaXJlaXEuYWkiLCJpYXQiOjE3NzU4MTgyNjEsImV4cCI6MTc3NTkwNDY2MX0.whmcxnBIFlmKcQPLnuL2Y_cT22e55nT2QFq6GaaDMgM" />
      <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
    </>
  )
}
