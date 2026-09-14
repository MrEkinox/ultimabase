import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

const application = new UltimaBase({
	plugins: [postgresPlugin({ schemaPolicy: 'fail', url: databaseUrl })],
	schemas: [],
})

try {
	await application.start()
	// Run application-owned work only after every startup phase succeeds.
} finally {
	await application.dispose()
}
