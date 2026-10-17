//#region main
import { ultimabase } from './ultimabase.ts'

await using started = await ultimabase.start()
//#region address
const address = started.plugin('@ultimabase/hono-server-plugin').address()
console.info(`Listening on port ${String(address?.port)}`)
//#endregion address
// SIGINT or SIGTERM stops the application: it refuses new requests, lets
// in-flight ones finish and closes the listener. Leaving this scope then
// closes the database.
await started.closed
//#endregion main
