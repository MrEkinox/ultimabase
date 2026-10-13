//#region main
import { once } from 'node:events'
import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

// Listen before starting, so a stop signal during startup is observed too.
const stopSignal = Promise.race([
	once(process, 'SIGINT'),
	once(process, 'SIGTERM'),
])
try {
	await ultimabase.start()
	//#region address
	const address = ultimabase.plugin('@ultimabase/hono-server-plugin').address()
	console.info(`Listening on port ${String(address?.port)}`)
	//#endregion address
	await stopSignal
} finally {
	// Refuses new requests, lets in-flight ones finish, then closes the
	// listener and the database.
	await ultimabase.dispose()
}
//#endregion main
