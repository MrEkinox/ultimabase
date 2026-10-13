//#region print-schema
import { ultimabase } from './ultimabase.ts'

// Starts the application, prints the schema it serves, then disposes it.
await using app = await ultimabase.start()
console.log(app.plugin('@ultimabase/graphql-plugin').printSchema())
//#endregion print-schema
