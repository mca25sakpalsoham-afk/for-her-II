const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 5

type FailedLoginRecord = {
  attempts: number
  firstFailedAt: number
}

export type LoginLimitStatus = {
  blocked: boolean
  retryAfterSeconds: number
}

/**
 * This deliberately tracks failures only. It is process-local, matching the
 * app's previous express-rate-limit memory store; production multi-instance
 * deployments should replace it with a shared implementation (for example Redis).
 */
export class LoginAttemptLimiter {
  private readonly failures = new Map<string, FailedLoginRecord>()

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly windowMs = WINDOW_MS,
    private readonly maxFailedAttempts = MAX_FAILED_ATTEMPTS,
  ) {}

  getStatus(ip: string, email: string): LoginLimitStatus {
    const key = this.key(ip, email)
    const record = this.activeRecord(key)
    if (!record || record.attempts < this.maxFailedAttempts) return { blocked: false, retryAfterSeconds: 0 }
    const retryAfterSeconds = Math.max(1, Math.ceil((record.firstFailedAt + this.windowMs - this.now()) / 1000))
    return { blocked: true, retryAfterSeconds }
  }

  recordFailure(ip: string, email: string) {
    const key = this.key(ip, email)
    const record = this.activeRecord(key)
    if (record) {
      record.attempts += 1
      return record.attempts
    }
    this.failures.set(key, { attempts: 1, firstFailedAt: this.now() })
    return 1
  }

  reset(ip: string, email: string) {
    this.failures.delete(this.key(ip, email))
  }

  attemptsFor(ip: string, email: string) {
    return this.activeRecord(this.key(ip, email))?.attempts ?? 0
  }

  clear() {
    this.failures.clear()
  }

  private key(ip: string, email: string) {
    return `${ip.trim() || 'unknown'}:${email.trim().toLowerCase()}`
  }

  private activeRecord(key: string) {
    const record = this.failures.get(key)
    if (record && this.now() - record.firstFailedAt >= this.windowMs) {
      this.failures.delete(key)
      return undefined
    }
    return record
  }
}

export const loginAttemptLimiter = new LoginAttemptLimiter()
export const loginLimiterConfig = { windowMs: WINDOW_MS, maxFailedAttempts: MAX_FAILED_ATTEMPTS }
