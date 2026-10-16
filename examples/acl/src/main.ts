import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()
//#endregion start

// No transport: starting synchronizes the tables, the tests show the rest.
process.stdout.write(`ACL example ${started.state}: tables synchronized\n`)
