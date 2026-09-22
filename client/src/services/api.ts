import axios from 'axios'

export const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000'
export const api = axios.create({ baseURL: `${apiBase}/api`, withCredentials: true, headers: { 'Content-Type': 'application/json' } })
export function setAccessToken(token?: string) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
  else delete api.defaults.headers.common.Authorization
}
export async function request<T>(method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: unknown): Promise<T> {
  const response = await api.request<{ success: boolean; data: T; message?: string }>({ method, url, data: body })
  if (!response.data.success) throw new Error(response.data.message || 'Something went wrong')
  return response.data.data
}
export const formatApiError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || 'Something went wrong' : error instanceof Error ? error.message : 'Something went wrong'
