import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()
//#endregion start

process.stdout.write(
	`GraphQL example ${started.state}: POST http://127.0.0.1:1337/graphql, GraphiQL at http://127.0.0.1:1337/graphiql\n`,
)

// The server plugin stops the application on SIGINT or SIGTERM; leaving
// this scope then disposes it.
await started.closed
