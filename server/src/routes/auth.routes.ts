import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { requireAuth, signToken } from '../middleware/auth.js'
import { asyncHandler, AppError, ok } from '../utils/http.js'
import { publicUser } from '../services/couple.service.js'
import { loginAttemptLimiter } from '../services/login-attempt-limiter.js'

const router = Router()
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128) })
const cookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE === 'true' || env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 12 * 60 * 60 * 1000, path: '/' }

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)
  const normalizedEmail = email.toLowerCase()
  const ip = req.ip || 'unknown'
  const limitStatus = loginAttemptLimiter.getStatus(ip, normalizedEmail)
  if (limitStatus.blocked) {
    res.setHeader('Retry-After', String(limitStatus.retryAfterSeconds))
    return res.status(429).json({ success: false, message: `Too many failed login attempts. Please try again in ${Math.ceil(limitStatus.retryAfterSeconds / 60)} minute(s).` })
  }
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { settings: true } })
  const authenticated = Boolean(user && await bcrypt.compare(password, user.passwordHash))
  if (!authenticated || !user) {
    loginAttemptLimiter.recordFailure(ip, normalizedEmail)
    throw new AppError(401, 'Invalid email or password')
  }
  loginAttemptLimiter.reset(ip, normalizedEmail)
  const accessToken = signToken({ sub: user.id, role: user.role, coupleId: user.coupleId })
  res.cookie('couple_session', accessToken, cookieOptions)
  return ok(res, { user: publicUser(user), accessToken })
}))
router.post('/logout', (_req, res) => { res.clearCookie('couple_session', { ...cookieOptions, maxAge: undefined }); return ok(res, { loggedOut: true }) })
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id }, include: { settings: true } })
  return ok(res, { user: publicUser(user), settings: user.settings })
}))
router.get('/socket-token', requireAuth, asyncHandler(async (req, res) => {
  const user = req.auth!
  return ok(res, { accessToken: signToken({ sub: user.id, role: user.role, coupleId: user.coupleId }) })
}))
export default router
