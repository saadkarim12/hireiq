import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const DEV_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjYjRmMWQ2My05NTE3LTQxMWMtYWJiMC0xNzZiNjRmYmUzN2EiLCJhZ2VuY3lJZCI6IjQwYzFlNDM1LTAzYjUtNGNjYy1iNmFiLWFmODQ5NjBjNmNiOSIsInJvbGUiOiJhZ2VuY3lfYWRtaW4iLCJlbWFpbCI6ImRldkBoaXJlaXEuYWkiLCJpYXQiOjE3Nzc2NTA0NTksImV4cCI6MTgwOTE4NjQ1OX0.Dj16sdCXBjsmQzBodOnXu9YA2ueOo28ilN9u10WG0G4'

const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DEV_TOKEN}`,
  },
  timeout: 30000,
})

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
