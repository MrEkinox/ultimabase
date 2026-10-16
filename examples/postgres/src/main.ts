import process from 'node:process'

import { postgresPluginName } from '@ultimabase/postgres-plugin'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() verifies the connection, then prepares the tables.
await using started = await ultimabase.start()
const { connection } = started.plugin(postgresPluginName)
console.info(connection.state) // 'connected'
//#endregion start

process.stdout.write(
	`PostgreSQL example ${started.state}: press Ctrl+C to stop\n`,
)

// Keep the pool open until the development process stops; leaving the
// `await using` scope closes it.
await new Promise<void>((resolve) => {
	process.once('SIGINT', () => {
		resolve()
	})
	process.once('SIGTERM', () => {
		resolve()
	})
})
