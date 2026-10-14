import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

// start() resolves to the application; leaving this scope disposes it.
await using app = await ultimabase.start()

process.stdout.write(
	`Plugin authoring example ${app.state}: REST on http://127.0.0.1:1337/api, GraphQL on /graphql\n`,
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
