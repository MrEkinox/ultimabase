import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

export const application = new UltimaBase({
	plugins: [
		postgresPlugin({ schemaPolicy: 'fail', url: databaseUrl }),
		httpPlugin({ appId: process.env.ULTIMABASE_APP_ID ?? 'api' }),
	],
	schemas: [],
})
