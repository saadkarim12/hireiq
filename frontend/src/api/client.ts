import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Singleton refresh — prevents race condition when multiple queries fire simultaneously
let cachedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkYTI2NGU5Mi04OTkzLTRkZmUtODU3OS1lZjQzZWU5ZWI4OWMiLCJhZ2VuY3lJZCI6ImYwMTRjODg2LWYyYWMtNGQ0OC04OTdjLTAwNzJhYjYzZjcwMCIsInJvbGUiOiJhZ2VuY3lfYWRtaW4iLCJlbWFpbCI6ImRldkBoaXJlaXEuYWkiLCJpYXQiOjE3NzU5MzI5NjYsImV4cCI6MTgwNzQ2ODk2Nn0.CqDUuaTPV1qguvFfw43mHfsnesMrsR2cUbXedVvSIL4'
let tokenExpiry = Date.now() + 364 * 24 * 60 * 60 * 1000
let refreshPromise: Promise<string> | null = null

async function refreshToken(): Promise<string> {
  if (refreshPromise) return refreshPromise
  refreshPromise = fetch('/api/token')
    .then(r => r.json())
    .then(d => {
      if (d.token) {
        cachedToken = d.token
        tokenExpiry = Date.now() + 20 * 60 * 60 * 1000
      }
      return cachedToken
    })
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken
  return refreshToken()
}

const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

apiClient.interceptors.request.use(async (config) => {
  const token = await getToken()
  config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      cachedToken = ''
      tokenExpiry = 0
      const token = await refreshToken()
      error.config.headers.Authorization = `Bearer ${token}`
      return apiClient.request(error.config)
    }
    return Promise.reject(error)
  }
)

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    apiClient.get<{ success: boolean; data: T; meta?: Record<string, unknown> }>(url, { params }),
  post: <T>(url: string, data?: unknown) =>
    apiClient.post<{ success: boolean; data: T }>(url, data),
  patch: <T>(url: string, data?: unknown) =>
    apiClient.patch<{ success: boolean; data: T }>(url, data),
  delete: <T>(url: string) =>
    apiClient.delete<{ success: boolean; data: T }>(url),
}

export default apiClient
