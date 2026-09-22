import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { apiBase } from '../services/api'
import { useAuth } from './AuthContext'

type SocketValue = { socket: Socket | null; connected: boolean }
const SocketContext = createContext<SocketValue>({ socket: null, connected: false })
export function SocketProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth(); const [socket, setSocket] = useState<Socket | null>(null); const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!auth) { socket?.disconnect(); setSocket(null); setConnected(false); return }
    const next = io(apiBase, { auth: { token: auth.socketToken }, withCredentials: true, transports: ['websocket', 'polling'] })
    next.on('connect', () => setConnected(true)); next.on('disconnect', () => setConnected(false)); setSocket(next)
    return () => { next.disconnect(); setSocket(null); setConnected(false) }
  }, [auth?.socketToken])
  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>
}
export const useSocket = () => useContext(SocketContext)
