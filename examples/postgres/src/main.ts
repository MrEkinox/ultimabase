import process from 'node:process'

import { postgresPluginName } from '@ultimabase/postgres-plugin'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() verifies the connection, then prepares the tables.
await using started = await ultimabase.start()
const { connection } = started.plugin(postgresPluginName)
console.info(connection.state) // 'connected'
//#endregion start

// Leaving this scope closes the pool.
process.stdout.write(`PostgreSQL example ${started.state}\n`)
