import { UltimaBase } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import type { PostgresFieldOption, PostgresSchemaOption } from './options.js'
import { postgresPlugin } from './plugin/postgres-plugin.js'

// This test-only generated-option contract is retained until issue 6313
// removes superseded Typegen projections after the authoring migration.
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly postgres?: PostgresFieldOption
	}

	interface UltimaBaseGeneratedSchemaOptions {
		readonly postgres?: PostgresSchemaOption
	}
}

test('types the direct PostgreSQL schema and field options exactly', () => {
	const App = UltimaBase.use(
		postgresPlugin({ url: 'postgresql://localhost/fixture' }),
	)
	const Post = App.Schema.define({
		className: 'PostgresDirectOptionTypePost',
		fields: (field) => ({
			title: field.string({
				postgres: { renamedFrom: 'headline' },
			}),
		}),
		postgres: { table: 'content_posts' },
	})

	expectTypeOf(Post.className).toEqualTypeOf<'PostgresDirectOptionTypePost'>()

	App.Schema.define({
		className: 'PostgresInvalidSchemaOption',
		fields: () => ({}),
		// @ts-expect-error -- The direct schema option requires one table name.
		postgres: {},
	})
	App.Schema.define({
		className: 'PostgresUnknownSchemaOption',
		fields: () => ({}),
		// @ts-expect-error -- Unknown PostgreSQL schema keys are rejected.
		postgres: { namespace: 'public', table: 'posts' },
	})
	App.Schema.define({
		className: 'PostgresInvalidFieldOption',
		fields: (field) => ({
			// @ts-expect-error -- renamedFrom must be a string.
			title: field.string({ postgres: { renamedFrom: 42 } }),
		}),
	})
	App.Schema.define({
		className: 'PostgresUnknownFieldOption',
		fields: (field) => ({
			// @ts-expect-error -- Unknown PostgreSQL field keys are rejected.
			title: field.string({ postgres: { column: 'title' } }),
		}),
	})
})
