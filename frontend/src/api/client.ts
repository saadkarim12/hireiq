import axios, { AxiosInstance, AxiosError } from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const DEV_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkYTI2NGU5Mi04OTkzLTRkZmUtODU3OS1lZjQzZWU5ZWI4OWMiLCJhZ2VuY3lJZCI6ImYwMTRjODg2LWYyYWMtNGQ0OC04OTdjLTAwNzJhYjYzZjcwMCIsInJvbGUiOiJhZ2VuY3lfYWRtaW4iLCJlbWFpbCI6ImRldkBoaXJlaXEuYWkiLCJpYXQiOjE3NzU5MDc1MDgsImV4cCI6MTc3NTk5MzkwOH0.jY7wAneaRwVBe9u8i9Znc2ma9TA0h0ViXvYOT3C5GbU'

const apiClient: AxiosInstance = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

apiClient.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${DEV_TOKEN}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error)
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
