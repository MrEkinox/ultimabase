import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()
//#endregion start

process.stdout.write(
	`Soft Delete example ${started.state}: REST on http://127.0.0.1:1337/api/classes/Post, GraphQL on POST http://127.0.0.1:1337/graphql\n`,
)

// The server plugin stops the application on SIGINT or SIGTERM; leaving
// this scope then disposes it.
await started.closed
