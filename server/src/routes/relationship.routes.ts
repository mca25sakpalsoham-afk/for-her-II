import { Router } from 'express'
import { CravingStatus, NotificationType, Role, TimelineCategory } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler, AppError, ok } from '../utils/http.js'
import { canShare, partnerFor, publicUser } from '../services/couple.service.js'
import { createNotification } from '../services/notification.service.js'
import { emitCouple } from '../socket/realtime.js'
import { cycleSummary, dayKey, startOfUtcDay } from '../utils/dates.js'
import { env } from '../config/env.js'

const router = Router()
router.use(requireAuth)

const dateSchema = z.coerce.date()
const cycleSchema = z.object({ startDate: dateSchema, endDate: dateSchema.optional().nullable(), notes: z.string().trim().max(1000).optional().nullable() }).refine((data) => !data.endDate || data.endDate >= data.startDate, { message: 'End date cannot be before start date', path: ['endDate'] })
const moodSchema = z.object({ mood: z.string().trim().min(1).max(80), emoji: z.string().trim().max(16).optional(), note: z.string().trim().max(280).optional() })
const checkInSchema = z.object({ feeling: z.enum(['Great', 'Good', 'Okay', 'Low', 'Bad', 'Need You']), message: z.string().trim().max(500).optional() })
const actionSchema = z.object({ kind: z.string().trim().min(1).max(50), label: z.string().trim().min(1).max(120), emoji: z.string().trim().max(16).optional(), message: z.string().trim().max(280).optional() })
const cravingSchema = z.object({ item: z.string().trim().min(1).max(120), emoji: z.string().trim().max(16).optional(), note: z.string().trim().max(280).optional() })
const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) })
const timelineSchema = z.object({ occurredOn: dateSchema, title: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).optional(), category: z.nativeEnum(TimelineCategory).optional() })
const cyclePatchSchema = z.object({ startDate: dateSchema.optional(), endDate: dateSchema.optional().nullable(), notes: z.string().trim().max(1000).optional().nullable() })
const idParam = (value: unknown) => z.string().cuid().parse(value)

async function me(req: Express.Request) {
  return prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id }, include: { settings: true } })
}
async function girlfriendFor(coupleId: string) {
  return prisma.user.findFirstOrThrow({ where: { coupleId, role: Role.GIRLFRIEND }, include: { settings: true } })
}
const dateValue = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null

router.get('/dashboard', asyncHandler(async (req, res) => {
  const current = await me(req)
  const girlfriend = current.role === Role.GIRLFRIEND ? current : await girlfriendFor(current.coupleId)
  const partner = await partnerFor(current)
  const [mood, checkIn, craving, action, cycles, notifications, activeCall] = await Promise.all([
    prisma.moodHistory.findFirst({ where: { userId: girlfriend.id }, orderBy: { createdAt: 'desc' } }),
    prisma.dailyCheckIn.findFirst({ where: { userId: girlfriend.id }, orderBy: { createdAt: 'desc' } }),
    prisma.craving.findFirst({ where: { requesterId: girlfriend.id }, include: { response: true }, orderBy: { createdAt: 'desc' } }),
    prisma.quickAction.findFirst({ where: { userId: girlfriend.id }, orderBy: { createdAt: 'desc' } }),
    prisma.cycle.findMany({ where: { userId: girlfriend.id }, orderBy: { startDate: 'desc' } }),
    prisma.notification.findMany({ where: { userId: current.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.videoCall.findFirst({ where: { coupleId: current.coupleId, status: { in: ['CALLING', 'ACCEPTED'] } }, orderBy: { createdAt: 'desc' } }),
  ])
  const summary = cycleSummary(cycles)
  const shared = current.role === Role.GIRLFRIEND || girlfriend.settings?.shareMood !== false
  const payload = {
    me: publicUser(current), partner: publicUser(partner),
    mood: shared ? mood : null,
    checkIn: current.role === Role.GIRLFRIEND || girlfriend.settings?.shareCheckIns !== false ? checkIn : null,
    craving: current.role === Role.GIRLFRIEND || girlfriend.settings?.shareCravings !== false ? craving : null,
    action,
    cycle: current.role === Role.GIRLFRIEND || girlfriend.settings?.shareCycle !== false ? { ...summary, estimatedNextPeriod: current.role === Role.GIRLFRIEND || girlfriend.settings?.shareEstimates !== false ? dateValue(summary.estimatedNextPeriod) : null } : null,
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
    activeCall: activeCall && (activeCall.callerId === current.id || activeCall.receiverId === current.id) ? activeCall : null,
  }
  return ok(res, payload)
}))

router.get('/cycles', asyncHandler(async (req, res) => {
  const current = await me(req)
  const girlfriend = current.role === Role.GIRLFRIEND ? current : await girlfriendFor(current.coupleId)
  if (current.role !== Role.GIRLFRIEND && girlfriend.settings?.shareCycle === false) return ok(res, { cycles: [], summary: null, private: true })
  const cycles = await prisma.cycle.findMany({ where: { userId: girlfriend.id }, orderBy: { startDate: 'desc' } })
  const summary = cycleSummary(cycles)
  const allowNotes = current.id === girlfriend.id
  const allowEstimates = current.id === girlfriend.id || girlfriend.settings?.shareEstimates !== false
  return ok(res, { cycles: cycles.map((cycle) => ({ ...cycle, notes: allowNotes ? cycle.notes : null })), summary: { ...summary, estimatedNextPeriod: allowEstimates ? dateValue(summary.estimatedNextPeriod) : null }, disclaimer: 'Cycle dates are estimates based on previous cycle history and are not medical advice.' })
}))
router.post('/cycles', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = cycleSchema.parse(req.body)
  const cycle = await prisma.cycle.create({ data: { ...input, startDate: startOfUtcDay(input.startDate), endDate: input.endDate ? startOfUtcDay(input.endDate) : null, userId: req.auth!.id } })
  const actor = await me(req); const partner = await partnerFor(actor)
  if (await canShare(actor.id, 'shareCycle')) {
    emitCouple(actor.coupleId, 'cycle:updated', { cycle })
    await createNotification({ userId: partner.id, actorId: actor.id, type: NotificationType.CYCLE, title: 'Cycle information was updated', entityId: cycle.id })
  }
  return ok(res, cycle, 201)
}))
router.patch('/cycles/:id', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = cyclePatchSchema.parse(req.body)
  const found = await prisma.cycle.findFirst({ where: { id: idParam(req.params.id), userId: req.auth!.id } })
  if (!found) throw new AppError(404, 'Cycle not found')
  const cycle = await prisma.cycle.update({ where: { id: found.id }, data: { ...input, startDate: input.startDate && startOfUtcDay(input.startDate), endDate: input.endDate && startOfUtcDay(input.endDate) } })
  return ok(res, cycle)
}))
router.delete('/cycles/:id', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const found = await prisma.cycle.findFirst({ where: { id: idParam(req.params.id), userId: req.auth!.id } })
  if (!found) throw new AppError(404, 'Cycle not found')
  await prisma.cycle.delete({ where: { id: found.id } }); return ok(res, { deleted: true })
}))

router.get('/moods/current', asyncHandler(async (req, res) => {
  const current = await me(req); const girlfriend = current.role === Role.GIRLFRIEND ? current : await girlfriendFor(current.coupleId)
  if (current.id !== girlfriend.id && !(await canShare(girlfriend.id, 'shareMood'))) return ok(res, { mood: null, private: true })
  return ok(res, { mood: await prisma.moodHistory.findFirst({ where: { userId: girlfriend.id }, orderBy: { createdAt: 'desc' } }) })
}))
router.get('/moods/history', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => ok(res, await prisma.moodHistory.findMany({ where: { userId: req.auth!.id }, orderBy: { createdAt: 'desc' }, take: 60 }))))
router.post('/moods', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = moodSchema.parse(req.body); const mood = await prisma.moodHistory.create({ data: { ...input, userId: req.auth!.id } })
  const actor = await me(req); const partner = await partnerFor(actor)
  if (await canShare(actor.id, 'shareMood')) {
    emitCouple(actor.coupleId, 'mood:updated', mood)
    await createNotification({ userId: partner.id, actorId: actor.id, type: NotificationType.MOOD, title: `Her mood changed to ${mood.emoji || ''} ${mood.mood}`.trim(), entityId: mood.id })
  }
  return ok(res, mood, 201)
}))

router.get('/checkins', asyncHandler(async (req, res) => {
  const current = await me(req); const girlfriend = current.role === Role.GIRLFRIEND ? current : await girlfriendFor(current.coupleId)
  if (current.id !== girlfriend.id && !(await canShare(girlfriend.id, 'shareCheckIns'))) return ok(res, { checkIn: null, private: true })
  return ok(res, { checkIn: await prisma.dailyCheckIn.findFirst({ where: { userId: girlfriend.id }, orderBy: { createdAt: 'desc' } }) })
}))
router.post('/checkins', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = checkInSchema.parse(req.body); const checkIn = await prisma.dailyCheckIn.upsert({ where: { userId_dateKey: { userId: req.auth!.id, dateKey: dayKey() } }, update: input, create: { ...input, userId: req.auth!.id, dateKey: dayKey() } })
  const actor = await me(req); const partner = await partnerFor(actor)
  if (await canShare(actor.id, 'shareCheckIns')) { emitCouple(actor.coupleId, 'checkin:created', checkIn); await createNotification({ userId: partner.id, actorId: actor.id, type: NotificationType.CHECKIN, title: `Her check-in: ${checkIn.feeling}`, body: checkIn.message || undefined, entityId: checkIn.id }) }
  return ok(res, checkIn, 201)
}))

router.get('/actions', asyncHandler(async (req, res) => {
  const current = await me(req); const girlfriend = current.role === Role.GIRLFRIEND ? current : await girlfriendFor(current.coupleId)
  return ok(res, await prisma.quickAction.findMany({ where: { userId: girlfriend.id }, orderBy: { createdAt: 'desc' }, take: 30 }))
}))
router.post('/actions', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = actionSchema.parse(req.body)
  if (input.kind === 'miss-you') {
    const last = await prisma.quickAction.findFirst({ where: { userId: req.auth!.id, kind: 'miss-you' }, orderBy: { createdAt: 'desc' } })
    if (last && Date.now() - last.createdAt.getTime() < 60_000) throw new AppError(429, 'Give that love a moment before sending another Miss You.')
  }
  const action = await prisma.quickAction.create({ data: { ...input, userId: req.auth!.id } }); const actor = await me(req); const partner = await partnerFor(actor)
  const messages = ['She misses you right now 🥺❤️', 'Someone needs your attention ❤️', 'Your girl misses you ❤️', 'She just pressed Miss You. Go talk to her 🫂']
  const title = input.kind === 'miss-you' ? messages[Math.floor(Math.random() * messages.length)] : `${action.emoji || '❤️'} ${action.label}`
  emitCouple(actor.coupleId, input.kind === 'miss-you' ? 'missyou:pressed' : 'action:created', action)
  await createNotification({ userId: partner.id, actorId: actor.id, type: input.kind === 'miss-you' ? NotificationType.MISS_YOU : NotificationType.ACTION, title, body: input.message || undefined, entityId: action.id })
  return ok(res, { action, message: title }, 201)
}))

router.get('/cravings', asyncHandler(async (req, res) => {
  const current = await me(req); const girlfriend = current.role === Role.GIRLFRIEND ? current : await girlfriendFor(current.coupleId)
  if (current.id !== girlfriend.id && !(await canShare(girlfriend.id, 'shareCravings'))) return ok(res, { cravings: [], private: true })
  return ok(res, { cravings: await prisma.craving.findMany({ where: { requesterId: girlfriend.id }, include: { response: { include: { responder: { select: { displayName: true, avatarUrl: true } } } }, requester: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }) })
}))
router.post('/cravings', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = cravingSchema.parse(req.body); const craving = await prisma.craving.create({ data: { ...input, requesterId: req.auth!.id } }); const actor = await me(req); const partner = await partnerFor(actor)
  if (await canShare(actor.id, 'shareCravings')) { emitCouple(actor.coupleId, 'craving:created', craving); await createNotification({ userId: partner.id, actorId: actor.id, type: NotificationType.CRAVING, title: `She is craving ${craving.item} ${craving.emoji || ''}`.trim(), body: craving.note || undefined, entityId: craving.id }) }
  return ok(res, craving, 201)
}))
router.patch('/cravings/:id/respond', requireRole(Role.BOYFRIEND), asyncHandler(async (req, res) => {
  const input = z.object({ status: z.enum(['ACCEPTED', 'ORDERED', 'COMPLETED', 'DECLINED']), message: z.string().trim().max(280).optional() }).parse(req.body)
  const current = await me(req); const girlfriend = await girlfriendFor(current.coupleId)
  const craving = await prisma.craving.findFirst({ where: { id: idParam(req.params.id), requesterId: girlfriend.id } })
  if (!craving) throw new AppError(404, 'Craving not found')
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.craving.update({ where: { id: craving.id }, data: { status: input.status as CravingStatus } })
    const response = await tx.cravingResponse.upsert({ where: { cravingId: craving.id }, update: { status: input.status as CravingStatus, message: input.message }, create: { cravingId: craving.id, responderId: current.id, status: input.status as CravingStatus, message: input.message } })
    return { ...item, response }
  })
  emitCouple(current.coupleId, 'craving:updated', updated)
  await createNotification({ userId: girlfriend.id, actorId: current.id, type: NotificationType.CRAVING, title: `Your craving update: ${input.status.toLowerCase()}`, body: input.message, entityId: craving.id })
  return ok(res, updated)
}))

router.get('/notes', asyncHandler(async (req, res) => {
  const current = await me(req); const partner = await partnerFor(current)
  if (current.role === Role.BOYFRIEND && !(await canShare(partner.id, 'shareNotes'))) return ok(res, [])
  const notes = await prisma.sharedNote.findMany({ where: { OR: [{ senderId: current.id, receiverId: partner.id }, { senderId: partner.id, receiverId: current.id }] }, include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' }, take: 100 })
  await prisma.sharedNote.updateMany({ where: { senderId: partner.id, receiverId: current.id, readAt: null }, data: { readAt: new Date() } })
  return ok(res, notes)
}))
router.post('/notes', asyncHandler(async (req, res) => {
  const { body } = noteSchema.parse(req.body); const current = await me(req); const partner = await partnerFor(current)
  if (current.role === Role.GIRLFRIEND && !(await canShare(current.id, 'shareNotes'))) throw new AppError(403, 'Enable note sharing in Privacy Settings before sending a shared note')
  const note = await prisma.sharedNote.create({ data: { senderId: current.id, receiverId: partner.id, body }, include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } } })
  emitCouple(current.coupleId, 'note:created', note)
  await createNotification({ userId: partner.id, actorId: current.id, type: NotificationType.NOTE, title: `${current.displayName} sent you a note 💌`, body: body.slice(0, 120), entityId: note.id })
  return ok(res, note, 201)
}))

router.get('/notifications', asyncHandler(async (req, res) => ok(res, await prisma.notification.findMany({ where: { userId: req.auth!.id }, orderBy: { createdAt: 'desc' }, take: 100 }))))
router.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findFirst({ where: { id: idParam(req.params.id), userId: req.auth!.id } }); if (!notification) throw new AppError(404, 'Notification not found')
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } }); emitCouple(req.auth!.coupleId, 'notification:read', { id: updated.id, userId: req.auth!.id }); return ok(res, updated)
}))

router.get('/privacy', asyncHandler(async (req, res) => ok(res, await prisma.privacySettings.upsert({ where: { userId: req.auth!.id }, update: {}, create: { userId: req.auth!.id } }))))
router.patch('/privacy', requireRole(Role.GIRLFRIEND), asyncHandler(async (req, res) => {
  const input = z.object({ shareCycle: z.boolean().optional(), shareEstimates: z.boolean().optional(), shareMood: z.boolean().optional(), shareCheckIns: z.boolean().optional(), shareCravings: z.boolean().optional(), shareNotes: z.boolean().optional() }).parse(req.body)
  return ok(res, await prisma.privacySettings.upsert({ where: { userId: req.auth!.id }, update: input, create: { userId: req.auth!.id, ...input } }))
}))

router.get('/profile', asyncHandler(async (req, res) => ok(res, { user: publicUser(await me(req)) })))
router.patch('/profile', asyncHandler(async (req, res) => {
  const input = z.object({ displayName: z.string().trim().min(1).max(80).optional(), avatarUrl: z.string().url().max(500).nullable().optional() }).parse(req.body)
  return ok(res, { user: publicUser(await prisma.user.update({ where: { id: req.auth!.id }, data: input })) })
}))

router.get('/timeline', asyncHandler(async (req, res) => ok(res, await prisma.timelineEvent.findMany({ where: { coupleId: req.auth!.coupleId }, include: { creator: { select: { displayName: true, avatarUrl: true } }, photos: true }, orderBy: { occurredOn: 'desc' } }))))
router.post('/timeline', asyncHandler(async (req, res) => {
  const input = timelineSchema.parse(req.body); const event = await prisma.timelineEvent.create({ data: { ...input, occurredOn: startOfUtcDay(input.occurredOn), coupleId: req.auth!.coupleId, creatorId: req.auth!.id }, include: { creator: { select: { displayName: true, avatarUrl: true } }, photos: true } })
  emitCouple(req.auth!.coupleId, 'timeline:created', event); return ok(res, event, 201)
}))
router.delete('/timeline/:id', asyncHandler(async (req, res) => {
  const found = await prisma.timelineEvent.findFirst({ where: { id: idParam(req.params.id), coupleId: req.auth!.coupleId, creatorId: req.auth!.id } }); if (!found) throw new AppError(404, 'Timeline event not found')
  await prisma.timelineEvent.delete({ where: { id: found.id } }); return ok(res, { deleted: true })
}))

router.get('/calls/history', asyncHandler(async (req, res) => ok(res, await prisma.videoCall.findMany({ where: { coupleId: req.auth!.coupleId }, include: { caller: { select: { displayName: true } }, receiver: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }))))
router.get('/calls/config', asyncHandler(async (_req, res) => {
  const iceServers: { urls: string; username?: string; credential?: string }[] = [{ urls: env.STUN_SERVER }]
  if (env.TURN_SERVER && env.TURN_USERNAME && env.TURN_PASSWORD) iceServers.push({ urls: env.TURN_SERVER, username: env.TURN_USERNAME, credential: env.TURN_PASSWORD })
  return ok(res, { iceServers })
}))
export default router
