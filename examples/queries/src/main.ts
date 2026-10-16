import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()

process.stdout.write(`Queries example ${started.state}\n`)

// Keep framework-owned resources until the development process stops.
await new Promise<void>((resolve) => {
	process.once('SIGINT', () => {
		resolve()
	})
	process.once('SIGTERM', () => {
		resolve()
	})
})
