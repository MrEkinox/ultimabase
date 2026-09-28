import { stdout } from 'node:process'

import { Schema, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const pool = {
	connect: async () => {
		throw new TypeError('Static option fixture does not connect')
	},
	end: async () => undefined,
	query: async () => ({ rows: [] }),
}

const compile = async (className, table) => {
	const Post = Schema.define({
		className,
		fields: (field) => ({
			title: field.string({ postgres: { renamedFrom: 'headline' } }),
		}),
		postgres: { table },
	})
	const application = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [postgresPlugin({ pool })],
		schemas: [Post],
	})
	const compiled = application.compile().schemas.get(className)
	const title = compiled.fields.title

	if (title === undefined) {
		throw new TypeError('Compiled PostgreSQL title field is unavailable')
	}

	const result = {
		field: title.options.postgres,
		fieldOwner:
			compiled.provenance.fieldOptions.title.postgres.definition.owner,
		schema: compiled.definition.postgres,
		schemaOwner: compiled.provenance.options.postgres.definition.owner,
	}

	await application.dispose()
	return result
}

const first = await compile('JavaScriptPostgresFirst', 'first_posts')
const second = await compile('JavaScriptPostgresSecond', 'second_posts')
const MissingPlugin = Schema.define({
	className: 'JavaScriptPostgresMissingPlugin',
	fields: () => ({}),
	postgres: { table: 'missing_posts' },
})
let missingPluginCode

try {
	new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [],
		schemas: [MissingPlugin],
	}).compile()
} catch (error) {
	missingPluginCode = error?.code
}

stdout.write(`${JSON.stringify({ first, missingPluginCode, second })}\n`)
