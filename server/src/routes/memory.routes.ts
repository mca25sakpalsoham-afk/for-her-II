import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError, ok } from '../utils/http.js'
import { emitCouple } from '../socket/realtime.js'

const uploadPath = path.resolve(process.cwd(), env.UPLOAD_DIR)
if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true })
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
})
const upload = multer({ storage, limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 }, fileFilter: (_req, file, callback) => callback(null, acceptedTypes.has(file.mimetype)) })
const router = Router()
router.use(requireAuth)
const memoryId = (value: unknown) => z.string().cuid().parse(value)

router.get('/', asyncHandler(async (req, res) => ok(res, await prisma.memoryPhoto.findMany({ where: { coupleId: req.auth!.coupleId }, include: { uploader: { select: { displayName: true, avatarUrl: true } }, timeline: { select: { id: true, title: true } } }, orderBy: { createdAt: 'desc' } }))))
router.post('/', upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(422, 'Upload a JPEG, PNG, or WebP image no larger than the configured limit')
  const input = z.object({ caption: z.string().trim().max(280).optional(), timelineId: z.string().cuid().optional() }).parse(req.body)
  if (input.timelineId) {
    const timeline = await prisma.timelineEvent.findFirst({ where: { id: input.timelineId, coupleId: req.auth!.coupleId } })
    if (!timeline) { unlinkSync(req.file.path); throw new AppError(404, 'Timeline event not found') }
  }
  const memory = await prisma.memoryPhoto.create({ data: { ...input, coupleId: req.auth!.coupleId, uploaderId: req.auth!.id, filename: req.file.filename, mimeType: req.file.mimetype, size: req.file.size } })
  emitCouple(req.auth!.coupleId, 'memory:created', memory)
  return ok(res, memory, 201)
}))
router.get('/:id/file', asyncHandler(async (req, res) => {
  const memory = await prisma.memoryPhoto.findFirst({ where: { id: memoryId(req.params.id), coupleId: req.auth!.coupleId } })
  if (!memory) throw new AppError(404, 'Photo not found')
  const filePath = path.join(uploadPath, memory.filename)
  if (!existsSync(filePath)) throw new AppError(404, 'Photo file is unavailable')
  res.setHeader('Content-Type', memory.mimeType); res.setHeader('Content-Length', memory.size); res.setHeader('Cache-Control', 'private, max-age=3600')
  createReadStream(filePath).pipe(res)
}))
router.delete('/:id', asyncHandler(async (req, res) => {
  const memory = await prisma.memoryPhoto.findFirst({ where: { id: memoryId(req.params.id), coupleId: req.auth!.coupleId, uploaderId: req.auth!.id } })
  if (!memory) throw new AppError(404, 'Photo not found')
  await prisma.memoryPhoto.delete({ where: { id: memory.id } }); const filePath = path.join(uploadPath, memory.filename); if (existsSync(filePath)) unlinkSync(filePath)
  return ok(res, { deleted: true })
}))
export default router
