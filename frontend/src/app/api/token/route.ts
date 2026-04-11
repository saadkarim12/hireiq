import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('http://localhost:3001/api/v1/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@saltrecruitment.ae' }),
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json({ token: data.data.accessToken })
  } catch {
    return NextResponse.json({ token: '' }, { status: 500 })
  }
}
