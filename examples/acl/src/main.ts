import process from 'node:process'

import { ultimabase } from './ultimabase.ts'

//#region start
// start() resolves to the application; leaving this scope disposes it.
await using app = await ultimabase.start()
//#endregion start

// No transport: starting synchronizes the tables, the tests show the rest.
process.stdout.write(`ACL example ${app.state}: tables synchronized\n`)
