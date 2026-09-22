import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/http.js'
import { env } from '../config/env.js'

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'Route not found'))
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof AppError ? error.status : error instanceof ZodError ? 422 : 500
  if (status >= 500) console.error(error)
  res.status(status).json({ success: false, message: error instanceof ZodError ? 'Invalid input' : error.message || 'Something went wrong', ...(env.NODE_ENV === 'development' && error instanceof ZodError ? { fields: error.flatten().fieldErrors } : {}) })
}
