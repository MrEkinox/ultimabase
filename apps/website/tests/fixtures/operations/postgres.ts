import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin, postgresPluginName } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

const application = new UltimaBase({
	plugins: [postgresPlugin({ schemaPolicy: 'fail', url: databaseUrl })],
	schemas: [],
})

await application.start()
const connection =
	application.application.getPlugin(postgresPluginName).connection
console.info(connection.state)
await application.dispose()
