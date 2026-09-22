import type { Server } from 'socket.io'
import type { Notification } from '@prisma/client'

let io: Server | undefined
export const setRealtime = (server: Server) => { io = server }
export const coupleRoom = (coupleId: string) => `couple:${coupleId}`
export const emitCouple = (coupleId: string, event: string, payload: unknown) => io?.to(coupleRoom(coupleId)).emit(event, payload)
export const emitUser = (userId: string, event: string, payload: unknown) => io?.to(`user:${userId}`).emit(event, payload)
export const emitNotification = (userId: string, notification: Notification) => emitUser(userId, 'notification:new', notification)
