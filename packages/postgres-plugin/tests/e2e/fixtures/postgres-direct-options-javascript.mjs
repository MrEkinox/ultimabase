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

// Schemas take the `postgres` rule in their final `.with` (ADR-0320); the old
// `define({ postgres })` form is rejected (ADR-0297).
const compile = async (className, table) => {
	const Application = UltimaBase.use(postgresPlugin({ pool }))
	const options = {
		className,
		fields: (field) => ({
			title: field.string({ postgres: { renamedFrom: 'headline' } }),
		}),
	}
	const Post = Application.Schema.define(options).with({ postgres: { table } })
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

const first = await compile('JavaScriptPostgresFirst', 'first_posts')
let oldFormMessage
try {
	UltimaBase.use(postgresPlugin({ pool })).Schema.define({
		className: 'JavaScriptPostgresOldForm',
		fields: () => ({}),
		postgres: { table: 'old_posts' },
	})
} catch (error) {
	oldFormMessage = error?.message
}
// Without the plugin, `plugins` has no `postgres` method (ADR-0339).
let missingRuleMessage
try {
	UltimaBase.Schema.define({
		className: 'JavaScriptPostgresMissingRule',
		fields: () => ({}),
	}).with({ postgres: { table: 'missing_posts' } })
} catch (error) {
	missingRuleMessage = error?.message
}
// Declared where PostgreSQL is installed, registered where it is not.
const MissingPlugin = UltimaBase.use(postgresPlugin({ pool }))
	.Schema.define({
		className: 'JavaScriptPostgresMissingPlugin',
		fields: () => ({}),
	})
	.with({ postgres: { table: 'missing_posts' } })
let missingPluginCode

try {
	new UltimaBase({
		logger: false,
		schemas: [MissingPlugin],
	}).compile()
} catch (error) {
	missingPluginCode = error?.code
}

stdout.write(
	`${JSON.stringify({ first, missingPluginCode, missingRuleMessage, oldFormMessage })}\n`,
)
