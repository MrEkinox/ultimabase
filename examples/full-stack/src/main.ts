import process from 'node:process'

import { createUltimabase } from './ultimabase.ts'

const masterKey = process.env.ULTIMABASE_MASTER_KEY

if (masterKey === undefined) {
	throw new TypeError('ULTIMABASE_MASTER_KEY is required')
}

const ultimabase = createUltimabase({ masterKey })

// postgresPlugin() reads DATABASE_URL when the application starts; start()
// resolves to ultimabase itself and leaving this scope disposes it.
await using started = await ultimabase.start()
process.stdout.write(
	`Full-stack REST and GraphQL application ${started.state} on 127.0.0.1:1337.\n`,
)

await new Promise<void>((resolve) => {
	process.once('SIGINT', () => {
		resolve()
	})
	process.once('SIGTERM', () => {
		resolve()
	})
})
