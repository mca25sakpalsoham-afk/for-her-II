import { defineConfig } from 'vitest/config'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'mysql://test:test@localhost:3306/for_her_test'
process.env.JWT_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass-validation'
process.env.CLIENT_URL ??= 'http://localhost:5173'

export default defineConfig({ test: { environment: 'node' } })
