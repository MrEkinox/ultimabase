import { Schema } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import type { PostgresFieldOption, PostgresSchemaOption } from './options.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly postgres?: PostgresFieldOption
	}

	interface UltimaBaseGeneratedSchemaOptions {
		readonly postgres?: PostgresSchemaOption
	}
}

test('types the direct PostgreSQL schema and field options exactly', () => {
	const Post = Schema.define({
		className: 'PostgresDirectOptionTypePost',
		fields: (field) => ({
			title: field.string({
				postgres: { renamedFrom: 'headline' },
			}),
		}),
		postgres: { table: 'content_posts' },
	})

	expectTypeOf(Post.className).toEqualTypeOf<'PostgresDirectOptionTypePost'>()

	Schema.define({
		className: 'PostgresInvalidSchemaOption',
		fields: () => ({}),
		// @ts-expect-error -- The direct schema option requires one table name.
		postgres: {},
	})
	Schema.define({
		className: 'PostgresUnknownSchemaOption',
		fields: () => ({}),
		// @ts-expect-error -- Unknown PostgreSQL schema keys are rejected.
		postgres: { namespace: 'public', table: 'posts' },
	})
	Schema.define({
		className: 'PostgresInvalidFieldOption',
		fields: (field) => ({
			// @ts-expect-error -- renamedFrom must be a string.
			title: field.string({ postgres: { renamedFrom: 42 } }),
		}),
	})
	Schema.define({
		className: 'PostgresUnknownFieldOption',
		fields: (field) => ({
			// @ts-expect-error -- Unknown PostgreSQL field keys are rejected.
			title: field.string({ postgres: { column: 'title' } }),
		}),
	})
})
