import { Role, type User } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

export async function partnerFor(user: Pick<User, 'id' | 'coupleId'>) {
  return prisma.user.findFirstOrThrow({ where: { coupleId: user.coupleId, id: { not: user.id } } })
}
export async function canShare(userId: string, field: 'shareCycle' | 'shareEstimates' | 'shareMood' | 'shareCheckIns' | 'shareCravings' | 'shareNotes') {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { settings: true } })
  return user.role !== Role.GIRLFRIEND || user.settings?.[field] !== false
}
export function publicUser(user: Pick<User, 'id' | 'displayName' | 'role' | 'avatarUrl'>) {
  return { id: user.id, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl }
}
