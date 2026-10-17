import process from 'node:process'

import { createUltimabase } from './ultimabase.ts'

const ultimabase = createUltimabase({})

// postgresPlugin() reads DATABASE_URL and the Master key ULTIMABASE_MASTER_KEY
// when the application starts; start() resolves to ultimabase itself, and
// the server plugin stops it on SIGINT or SIGTERM.
await using started = await ultimabase.start()
process.stdout.write(
	`Full-stack REST and GraphQL application ${started.state} on 127.0.0.1:1337.\n`,
)
await started.closed
