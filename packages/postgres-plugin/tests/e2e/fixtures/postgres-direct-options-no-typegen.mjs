import { stdout } from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const pool = {
	connect: async () => {
		throw new TypeError('Static option fixture does not connect')
	},
	end: async () => undefined,
	query: async () => ({ rows: [] }),
}

// The first schema uses the `.with` rule (ADR-0320); the second the old
// `define({ postgres })` form, accepted at runtime until it is removed.
const compile = async (className, table, form) => {
	const Application = UltimaBase.use(postgresPlugin({ pool }))
	const options = {
		className,
		fields: (field) => ({
			title: field.string({ postgres: { renamedFrom: 'headline' } }),
		}),
	}
	const Post =
		form === 'rule'
			? Application.Schema.define(options).with({ postgres: { table } })
			: Application.Schema.define({ ...options, postgres: { table } })
	const application = new Application({
		logger: false,
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

const first = await compile('JavaScriptPostgresFirst', 'first_posts', 'rule')
const second = await compile(
	'JavaScriptPostgresSecond',
	'second_posts',
	'option',
)
const MissingPlugin = UltimaBase.Schema.define({
	className: 'JavaScriptPostgresMissingPlugin',
	fields: () => ({}),
}).with({
	postgres: { table: 'missing_posts' },
})
let missingPluginCode

try {
	new UltimaBase({
		logger: false,
		schemas: [MissingPlugin],
	}).compile()
} catch (error) {
	missingPluginCode = error?.code
}

stdout.write(`${JSON.stringify({ first, missingPluginCode, second })}\n`)
