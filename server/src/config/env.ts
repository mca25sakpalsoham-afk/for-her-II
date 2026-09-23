import 'dotenv/config'
import { z } from 'zod'

const parsed = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_PORT: z.coerce.number().int().min(1).default(Number(process.env.PORT) || 4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.string().url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  STUN_SERVER: z.string().default('stun:stun.l.google.com:19302'),
  TURN_SERVER: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_PASSWORD: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().positive().default(5_242_880),
}).safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment configuration')
}
export const env = parsed.data
