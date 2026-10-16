import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()
//#endregion start

process.stdout.write(
	`Soft Delete example ${started.state}: REST on http://127.0.0.1:1337/api/classes/Post, GraphQL on POST http://127.0.0.1:1337/graphql\n`,
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
