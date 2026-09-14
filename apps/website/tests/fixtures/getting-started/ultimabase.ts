import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { Task } from './schema.js'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
	throw new TypeError('DATABASE_URL is required')
}

export const ultimabase = new UltimaBase({
	plugins: [
		postgresPlugin({
			schemaPolicy: 'override',
			url: databaseUrl,
		}),
	],
	schemas: [Task],
})
