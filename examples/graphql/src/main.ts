import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to the application; leaving this scope disposes it.
await using app = await ultimabase.start()
//#endregion start

process.stdout.write(
	`GraphQL example ${app.state}: POST http://127.0.0.1:1337/graphql, GraphiQL at http://127.0.0.1:1337/graphiql\n`,
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
