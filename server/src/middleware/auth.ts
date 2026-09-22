import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'
import { env } from '../config/env.js'
import { AppError } from '../utils/http.js'

export type TokenPayload = { sub: string; role: Role; coupleId: string }
export const signToken = (user: TokenPayload) => jwt.sign({ role: user.role, coupleId: user.coupleId }, env.JWT_SECRET, { subject: user.sub, expiresIn: '12h', issuer: 'for-her' })
export const verifyToken = (token: string): TokenPayload => {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'for-her' }) as jwt.JwtPayload
  if (!payload.sub || !payload.role || !payload.coupleId) throw new Error('Malformed token')
  return { sub: payload.sub, role: payload.role as Role, coupleId: payload.coupleId as string }
}
const getToken = (req: Request) => req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.cookies?.couple_session

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getToken(req)
    if (!token) throw new AppError(401, 'Authentication required')
    const user = verifyToken(token)
    req.auth = { id: user.sub, role: user.role, coupleId: user.coupleId }
    next()
  } catch {
    next(new AppError(401, 'Your session is invalid or has expired'))
  }
}
export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) =>
  req.auth && roles.includes(req.auth.role) ? next() : next(new AppError(403, 'You do not have access to this action'))
