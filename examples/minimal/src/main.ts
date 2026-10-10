import process from 'node:process'

import { createMinimalApplication } from './create-application.ts'

const masterKey = process.env.ULTIMABASE_MASTER_KEY

if (masterKey === undefined) {
	throw new TypeError('ULTIMABASE_MASTER_KEY is required')
}

// postgresPlugin() reads DATABASE_URL when the application starts; start()
// resolves to the application and leaving this scope disposes it.
await using app = await createMinimalApplication({ masterKey }).start()
process.stdout.write(
	`Minimal REST and GraphQL application ${app.state} on 127.0.0.1:1337.\n`,
)

await new Promise<void>((resolve) => {
	process.once('SIGINT', () => resolve())
	process.once('SIGTERM', () => resolve())
})
