import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to the application; leaving this scope disposes it.
await using app = await ultimabase.start()
//#endregion start

process.stdout.write(
	`REST example ${app.state}: GET http://127.0.0.1:1337/api/classes/Post\n`,
)

// Keep framework-owned resources until the development process stops.
await new Promise<void>((resolve) => {
	process.once('SIGINT', () => {
		resolve()
	})
	process.once('SIGTERM', () => {
		resolve()
	})
})
