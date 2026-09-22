import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.routes.js'
import relationshipRoutes from './routes/relationship.routes.js'
import memoryRoutes from './routes/memory.routes.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { env } from './config/env.js'

export const app = express()
app.disable('x-powered-by')
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(cors({ origin: env.CLIENT_URL, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }))
app.use(compression())
app.use(express.json({ limit: '250kb' }))
app.use(cookieParser())
app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }))
app.use('/api/auth', authRoutes)
app.use('/api/memories', memoryRoutes)
app.use('/api', relationshipRoutes)
app.use(notFound)
app.use(errorHandler)
