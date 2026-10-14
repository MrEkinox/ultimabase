import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to the application; leaving this scope disposes it.
await using app = await ultimabase.start()
//#endregion start

process.stdout.write(
	`Modeling example ${app.state}, database ${await app.health()}\n`,
)
