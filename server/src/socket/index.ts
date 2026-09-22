import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import { CallStatus, NotificationType } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { verifyToken, type TokenPayload } from '../middleware/auth.js'
import { coupleRoom, setRealtime } from './realtime.js'
import { createNotification } from '../services/notification.service.js'

type AuthedSocket = Socket & { user?: TokenPayload }
const callIdSchema = (value: unknown) => typeof value === 'string' && value.length > 5 ? value : null
async function authorizedCall(socket: AuthedSocket, callId: unknown) {
  const id = callIdSchema(callId); if (!id || !socket.user) return null
  return prisma.videoCall.findFirst({ where: { id, coupleId: socket.user.coupleId, OR: [{ callerId: socket.user.sub }, { receiverId: socket.user.sub }] } })
}

export function createSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: env.CLIENT_URL, credentials: true, methods: ['GET', 'POST'] }, transports: ['websocket', 'polling'] })
  setRealtime(io)
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.cookie?.match(/(?:^|;\s*)couple_session=([^;]+)/)?.[1]
      if (!token) throw new Error('Missing token')
      ;(socket as AuthedSocket).user = verifyToken(decodeURIComponent(token))
      next()
    } catch { next(new Error('Unauthorized socket connection')) }
  })
  io.on('connection', async (socket: AuthedSocket) => {
    const user = socket.user!
    const exists = await prisma.user.findFirst({ where: { id: user.sub, coupleId: user.coupleId, role: user.role } })
    if (!exists) return socket.disconnect(true)
    socket.join(coupleRoom(user.coupleId)); socket.join(`user:${user.sub}`)
    socket.on('call:invite', async (_payload, ack) => {
      try {
        const receiver = await prisma.user.findFirstOrThrow({ where: { coupleId: user.coupleId, id: { not: user.sub } }, select: { id: true, displayName: true, avatarUrl: true } })
        const call = await prisma.videoCall.create({ data: { coupleId: user.coupleId, callerId: user.sub, receiverId: receiver.id, status: CallStatus.CALLING }, include: { caller: { select: { id: true, displayName: true, avatarUrl: true } } } })
        io.to(`user:${receiver.id}`).emit('call:invite', { call, caller: call.caller })
        await createNotification({ userId: receiver.id, actorId: user.sub, type: NotificationType.CALL, title: `${call.caller.displayName} wants to video call you`, entityId: call.id })
        ack?.({ ok: true, call })
      } catch { ack?.({ ok: false, message: 'Unable to start this call' }) }
    })
    socket.on('call:accept', async ({ callId }, ack) => {
      const call = await authorizedCall(socket, callId)
      if (!call || call.receiverId !== user.sub || call.status !== CallStatus.CALLING) return ack?.({ ok: false, message: 'This call is no longer available' })
      const updated = await prisma.videoCall.update({ where: { id: call.id }, data: { status: CallStatus.ACCEPTED, startedAt: new Date() } })
      io.to(coupleRoom(user.coupleId)).emit('call:accept', { call: updated, acceptedBy: user.sub }); ack?.({ ok: true, call: updated })
    })
    socket.on('call:decline', async ({ callId }, ack) => {
      const call = await authorizedCall(socket, callId)
      if (!call || call.receiverId !== user.sub || call.status !== CallStatus.CALLING) return ack?.({ ok: false })
      const updated = await prisma.videoCall.update({ where: { id: call.id }, data: { status: CallStatus.DECLINED, endedAt: new Date() } })
      io.to(coupleRoom(user.coupleId)).emit('call:decline', { call: updated, declinedBy: user.sub }); ack?.({ ok: true })
    })
    socket.on('call:offer', async ({ callId, offer }) => { const call = await authorizedCall(socket, callId); if (call?.status === CallStatus.ACCEPTED && offer) socket.to(coupleRoom(user.coupleId)).emit('call:offer', { callId: call.id, offer, from: user.sub }) })
    socket.on('call:answer', async ({ callId, answer }) => { const call = await authorizedCall(socket, callId); if (call?.status === CallStatus.ACCEPTED && answer) socket.to(coupleRoom(user.coupleId)).emit('call:answer', { callId: call.id, answer, from: user.sub }) })
    socket.on('call:ice-candidate', async ({ callId, candidate }) => { const call = await authorizedCall(socket, callId); if (call?.status === CallStatus.ACCEPTED && candidate) socket.to(coupleRoom(user.coupleId)).emit('call:ice-candidate', { callId: call.id, candidate, from: user.sub }) })
    socket.on('call:end', async ({ callId }, ack) => {
      const call = await authorizedCall(socket, callId)
      if (!call || ['ENDED', 'DECLINED', 'FAILED'].includes(call.status)) return ack?.({ ok: false })
      const endedAt = new Date(); const durationSec = call.startedAt ? Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)) : 0
      const updated = await prisma.videoCall.update({ where: { id: call.id }, data: { status: CallStatus.ENDED, endedAt, durationSec } })
      io.to(coupleRoom(user.coupleId)).emit('call:end', { call: updated, endedBy: user.sub }); ack?.({ ok: true })
    })
  })
  return io
}
