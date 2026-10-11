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

test('types the PostgreSQL table rule and field option exactly', () => {
	const App = UltimaBase.use(
		postgresPlugin({ url: 'postgresql://localhost/fixture' }),
	)
	// ADR-0320: the table is a `.with` rule.
	const Post = App.Schema.define({
		className: 'PostgresDirectOptionTypePost',
		fields: (field) => ({
			title: field.string({
				postgres: { renamedFrom: 'headline' },
			}),
		}),
	}).with({ postgres: { table: 'content_posts' } })

	expectTypeOf(Post.className).toEqualTypeOf<'PostgresDirectOptionTypePost'>()

	App.Schema.define({
		className: 'PostgresInvalidSchemaOption',
		fields: () => ({}),
	}).with({
		// @ts-expect-error -- The table rule requires one table name.
		postgres: {},
	})
	App.Schema.define({
		className: 'PostgresUnknownSchemaOption',
		fields: () => ({}),
	}).with({
		// @ts-expect-error -- Unknown PostgreSQL rule keys are rejected.
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
	UltimaBase.Schema.define({
		className: 'PostgresRuleWithoutPlugin',
		fields: () => ({}),
	}).with({
		// @ts-expect-error -- The rule exists only with postgresPlugin().
		postgres: { table: 'posts' },
	})
})
