import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const girlfriendPassword = process.env.GIRLFRIEND_PASSWORD
  const boyfriendPassword = process.env.BOYFRIEND_PASSWORD
  const girlfriendEmail = process.env.GIRLFRIEND_EMAIL
  const boyfriendEmail = process.env.BOYFRIEND_EMAIL
  if (!girlfriendPassword || !boyfriendPassword || !girlfriendEmail || !boyfriendEmail) {
    throw new Error('Set GIRLFRIEND_EMAIL, GIRLFRIEND_PASSWORD, BOYFRIEND_EMAIL, and BOYFRIEND_PASSWORD before seeding.')
  }
  const couple = await prisma.couple.upsert({ where: { id: 'private-couple' }, update: {}, create: { id: 'private-couple', name: process.env.COUPLE_NAME || 'Us' } })
  for (const entry of [
    { email: girlfriendEmail, password: girlfriendPassword, name: process.env.GIRLFRIEND_NAME || 'Her', role: Role.GIRLFRIEND },
    { email: boyfriendEmail, password: boyfriendPassword, name: process.env.BOYFRIEND_NAME || 'Him', role: Role.BOYFRIEND },
  ]) {
    const passwordHash = await bcrypt.hash(entry.password, 12)
    await prisma.user.upsert({
      where: { email: entry.email.toLowerCase() },
      update: { displayName: entry.name, passwordHash, coupleId: couple.id },
      create: { email: entry.email.toLowerCase(), passwordHash, displayName: entry.name, role: entry.role, coupleId: couple.id, settings: { create: {} } },
    })
  }
}
main().finally(() => prisma.$disconnect())
