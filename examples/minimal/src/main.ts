import process from 'node:process'

import { createMinimalRestApplication } from './create-application.ts'

const databaseUrl = process.env.DATABASE_URL
const masterKey = process.env.ULTIMABASE_MASTER_KEY

if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')
if (masterKey === undefined) {
	throw new TypeError('ULTIMABASE_MASTER_KEY is required')
}

const ultimabase = createMinimalRestApplication({ databaseUrl, masterKey })
await ultimabase.start()
process.stdout.write('Minimal REST application listening on 127.0.0.1:1337.\n')

const shutdown = async (): Promise<void> => {
	await ultimabase.dispose()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
