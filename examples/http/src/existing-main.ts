//#region serve
import { once } from 'node:events'
import process from 'node:process'

import { serve } from '@hono/node-server'

import { admin, app } from './existing-app.ts'

await admin.start()
// This listener is yours: UltimaBase never opens or closes it.
const listener = serve({ fetch: app.fetch, port: 3000 })
//#endregion serve

console.info('Admin example: GET http://127.0.0.1:3000/ping and /health')

//#region close
await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')])
try {
	// UltimaBase stops first; `/ping` keeps answering until the listener closes.
	await admin.dispose()
} finally {
	await new Promise<void>((resolve, reject) => {
		listener.close((error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})
}
//#endregion close
