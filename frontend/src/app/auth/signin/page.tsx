'use client'
// src/app/auth/signin/page.tsx
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = async () => {
    setIsLoading(true)
    await signIn('azure-ad-b2c', { callbackUrl: '/dashboard' })
  }

  return (
    <div className="min-h-screen bg-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-gold rounded-2xl mb-4 shadow-lg">
            <span className="text-brand-navy font-black text-2xl">IQ</span>
          </div>
          <h1 className="text-3xl font-black text-white">HireIQ</h1>
          <p className="text-brand-gold text-sm font-medium mt-1">Screen Smarter. Hire Faster.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-brand-navy mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 mb-6">Sign in to your agency account</p>

          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full btn-primary py-3 text-base justify-center"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing in...
              </div>
            ) : (
              'Sign In with Company Account'
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Secured by Azure Active Directory B2C
          </p>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          © 2026 HireIQ · UAE & KSA
        </p>
      </div>
    </div>
  )
}
