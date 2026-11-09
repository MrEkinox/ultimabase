// What `ultimabase dev` runs under `node --watch` (D-105): the application
// of the config file it is given. A `dev` run by a program hears how its
// first start went (D-356).
import { reportStart } from './cli-dev.ts'
import { serve } from './cli-main.ts'

const code = await serve(process.argv[2])
process.exitCode = code
await reportStart(code)
