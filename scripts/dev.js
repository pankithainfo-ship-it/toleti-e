import { createServer as createViteServer } from 'vite'
import { createApiServer } from '../server/index.js'

const apiServer = createApiServer()
let viteServer
let isShuttingDown = false

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true

  if (viteServer) await viteServer.close()
  if (apiServer.listening) {
    await new Promise((resolve, reject) => {
      apiServer.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

try {
  const apiPort = Number(process.env.API_PORT || 3001)
  await listen(apiServer, apiPort, '127.0.0.1')
  viteServer = await createViteServer()
  await viteServer.listen()
  viteServer.printUrls()
  console.log(`Document API listening on http://127.0.0.1:${apiPort}`)
  console.log('Quotations are saved in quotation.json.')
  console.log('Purchase orders are saved in purchase order.json.')
  console.log('Debit notes are saved in Debit note.json.')
  console.log('Credit notes are saved in Credit note.json.')
  console.log('Delivery challans are saved in delivery challance.json.')

  process.on('SIGINT', () => shutdown().catch((error) => {
    console.error('Could not stop development servers:', error)
    process.exitCode = 1
  }))
  process.on('SIGTERM', () => shutdown().catch((error) => {
    console.error('Could not stop development servers:', error)
    process.exitCode = 1
  }))
} catch (error) {
  await shutdown()
  console.error('Could not start development servers:', error)
  process.exitCode = 1
}
