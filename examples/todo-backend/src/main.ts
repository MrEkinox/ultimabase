import process from 'node:process'

import { ultimabase } from './application.ts'

// start() resolves to the application; leaving this scope disposes it.
await using app = await ultimabase.start()

process.stdout.write(
	`Todo backend ${app.state}. Generated types are available in .ultimabase/schema.generated.d.ts.\n`,
)

// Keep framework-owned resources until the development process stops.
await new Promise<void>((resolve) => {
	process.once('SIGINT', () => resolve())
	process.once('SIGTERM', () => resolve())
})
