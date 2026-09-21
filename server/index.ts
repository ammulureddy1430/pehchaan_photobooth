import { createAppContext, createAppServer } from './app.js'
import { closeDefaultDatabase } from './db/database.js'

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'

const ctx = createAppContext()
const server = createAppServer(ctx)

server.listen(PORT, HOST, () => {
  console.log(`[Pehchaan Cloud Backend] Server listening on http://${HOST}:${PORT}`)
  void ctx.tunnel?.startTunnel().then((url) => {
    if (url) {
      console.log(`[Pehchaan Cloud Backend] 🌐 Public Internet Gallery ready at: ${url}`)
    }
  })
})

function shutdown(signal: string) {
  console.log(`[Pehchaan Cloud Backend] Received ${signal}, shutting down...`)
  ctx.tunnel?.stopTunnel()
  server.close(() => {
    closeDefaultDatabase()
    console.log('[Pehchaan Cloud Backend] Database closed and server terminated cleanly.')
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
