import type { NextFunction, Request, Response } from 'express'

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next)

export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data })
}
