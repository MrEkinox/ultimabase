import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to ultimabase itself; leaving this scope disposes it and
// waits for pending after-commit work.
await using started = await ultimabase.start()
//#endregion start

process.stdout.write(
	`Hooks example ${started.state}: REST on http://127.0.0.1:1337/api/classes/Post\n`,
)

// The server plugin stops the application on SIGINT or SIGTERM; leaving
// this scope then disposes it.
await started.closed
