import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()

process.stdout.write(
	`Todo backend ${started.state}: REST on http://127.0.0.1:1337/api/classes/Todo\n`,
)

// The server plugin stops the application on SIGINT or SIGTERM; leaving
// this scope then disposes it.
await started.closed
