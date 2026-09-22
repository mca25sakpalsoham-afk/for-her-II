import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }))
vi.mock('bcrypt', () => ({ default: { compare: mocks.compare } }))

import authRoutes from './auth.routes.js'
import { errorHandler } from '../middleware/errors.js'
import { loginAttemptLimiter } from '../services/login-attempt-limiter.js'

const girlfriend = { id: 'girlfriend-id', email: 'her@example.com', passwordHash: 'her-hash', displayName: 'Her', role: 'GIRLFRIEND', coupleId: 'couple-id', avatarUrl: null, settings: null }
const boyfriend = { id: 'boyfriend-id', email: 'him@example.com', passwordHash: 'him-hash', displayName: 'Him', role: 'BOYFRIEND', coupleId: 'couple-id', avatarUrl: null, settings: null }
const testIp = '198.51.100.24'

function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  app.use(errorHandler)
  return app
}

function login(app: express.Express, email: string, password: string) {
  return request(app).post('/api/auth/login').set('X-Forwarded-For', testIp).send({ email, password })
}

describe('login failed-attempt rate limiting', () => {
  let app: express.Express

  beforeEach(() => {
    loginAttemptLimiter.clear()
    mocks.findUnique.mockImplementation(({ where }: { where: { email: string } }) => Promise.resolve(where.email === girlfriend.email ? girlfriend : where.email === boyfriend.email ? boyfriend : null))
    mocks.compare.mockImplementation((password: string, hash: string) => Promise.resolve((password === 'correct-password' && hash === 'her-hash') || (password === 'boyfriend-password' && hash === 'him-hash')))
    app = createApp()
  })

  it('increments only after an actual authentication failure', async () => {
    await login(app, girlfriend.email, 'wrong-password').expect(401)
    expect(loginAttemptLimiter.attemptsFor(testIp, girlfriend.email)).toBe(1)

    await login(app, 'not-an-email', 'wrong-password').expect(422)
    expect(loginAttemptLimiter.attemptsFor(testIp, girlfriend.email)).toBe(1)
  })

  it('clears that account/IP failed-attempt counter after a successful login', async () => {
    await login(app, girlfriend.email, 'wrong-password').expect(401)
    await login(app, girlfriend.email, 'correct-password').expect(200)
    expect(loginAttemptLimiter.attemptsFor(testIp, girlfriend.email)).toBe(0)
  })

  it('allows a legitimate login after logout without adding a rate-limit failure', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/login').set('X-Forwarded-For', testIp).send({ email: girlfriend.email, password: 'correct-password' }).expect(200)
    await agent.post('/api/auth/logout').set('X-Forwarded-For', testIp).expect(200)
    await agent.post('/api/auth/login').set('X-Forwarded-For', testIp).send({ email: girlfriend.email, password: 'correct-password' }).expect(200)
    expect(loginAttemptLimiter.attemptsFor(testIp, girlfriend.email)).toBe(0)
  })

  it('blocks only after the failed-attempt threshold has been exceeded', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await login(app, girlfriend.email, 'wrong-password').expect(401)
    const blocked = await login(app, girlfriend.email, 'wrong-password').expect(429)
    expect(blocked.body.message).toMatch(/Too many failed login attempts/)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('keeps girlfriend and boyfriend attempts independent on the same IP', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await login(app, girlfriend.email, 'wrong-password').expect(401)
    await login(app, girlfriend.email, 'wrong-password').expect(429)
    await login(app, boyfriend.email, 'boyfriend-password').expect(200)
    expect(loginAttemptLimiter.attemptsFor(testIp, boyfriend.email)).toBe(0)
  })
})
