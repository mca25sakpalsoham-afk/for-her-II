import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { request, setAccessToken } from '../services/api'
import type { PrivacySettings, User } from '../types'

type AuthState = { user: User; settings?: PrivacySettings; socketToken: string }
type AuthContextValue = { auth: AuthState | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void>; setAuth: (next: AuthState | null) => void }
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null); const [loading, setLoading] = useState(true)
  const refresh = async () => {
    try {
      const me = await request<{ user: User; settings?: PrivacySettings }>('get', '/auth/me')
      const socket = await request<{ accessToken: string }>('get', '/auth/socket-token')
      setAccessToken(socket.accessToken); setAuth({ ...me, socketToken: socket.accessToken })
    } catch { setAccessToken(); setAuth(null) }
  }
  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])
  const login = async (email: string, password: string) => {
    const result = await request<{ user: User; accessToken: string }>('post', '/auth/login', { email, password })
    setAccessToken(result.accessToken); const me = await request<{ user: User; settings?: PrivacySettings }>('get', '/auth/me')
    setAuth({ ...me, socketToken: result.accessToken })
  }
  const logout = async () => { await request('post', '/auth/logout'); setAccessToken(); setAuth(null) }
  return <AuthContext.Provider value={{ auth, loading, login, logout, refresh, setAuth }}>{children}</AuthContext.Provider>
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context }
