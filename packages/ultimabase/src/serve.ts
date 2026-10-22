// What `ultimabase dev` runs under `node --watch` (D-105): the application
// of the config file it is given.
import { serve } from './cli-main.ts'

process.exitCode = await serve(process.argv[2])
