import { createServer } from 'node:http'
import { app } from './app.js'
import { env } from './config/env.js'
import { createSocket } from './socket/index.js'
import { prisma } from './lib/prisma.js'

const server = createServer(app)
createSocket(server)
const PORT = Number(process.env.PORT) || env.SERVER_PORT

server.listen(PORT, "0.0.0.0", () => {
  console.info(`for her API listening on :${PORT}`)
})
async function shutdown() { await prisma.$disconnect(); server.close(() => process.exit(0)) }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
