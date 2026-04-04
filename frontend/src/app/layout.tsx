// src/app/layout.tsx
import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'HireIQ — Screen Smarter. Hire Faster.',
    template: '%s | HireIQ',
  },
  description: 'AI-powered WhatsApp candidate screening for recruitment agencies in UAE & KSA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-gray-50 text-gray-900">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { background: '#0D1B2A', color: '#fff', borderRadius: '8px', fontSize: '14px' },
              success: { iconTheme: { primary: '#C9A84C', secondary: '#0D1B2A' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
