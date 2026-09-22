import { NotificationType } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { emitNotification } from '../socket/realtime.js'

export async function createNotification(input: { userId: string; actorId?: string; type: NotificationType; title: string; body?: string; entityId?: string }) {
  const notification = await prisma.notification.create({ data: input })
  emitNotification(input.userId, notification)
  return notification
}
