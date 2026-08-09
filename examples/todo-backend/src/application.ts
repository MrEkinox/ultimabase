import { fileURLToPath } from 'node:url'

import { codegenPlugin } from '@ultimabase/codegen'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { Todo } from './schema.ts'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined || databaseUrl.trim() === '') {
	throw new TypeError('DATABASE_URL is required to start the Todo backend')
}

const generatedTypesPath = fileURLToPath(
	new URL('../.ultimabase/schema.generated.d.ts', import.meta.url),
)

/** Owns the Todo schema, automatic type generation, and PostgreSQL lifecycle. */
export const ultimabase = new UltimaBase({
	plugins: [
		codegenPlugin({
			applicationId: 'todo-backend',
			outputPath: generatedTypesPath,
		}),
		postgresPlugin({
			schemaPolicy: 'override',
			url: databaseUrl,
		}),
	],
	schemas: [Todo],
})
