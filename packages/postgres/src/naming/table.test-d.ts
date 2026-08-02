import { type SchemaExtension } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import { postgresTable, type PostgresTableExtension } from './table.js'

test('preserves an explicit table-name literal in schema metadata', () => {
	const extension = postgresTable({ name: 'tenant.posts-v2' })

	expectTypeOf(extension).toEqualTypeOf<
		PostgresTableExtension<'tenant.posts-v2'>
	>()
	expectTypeOf(extension).toEqualTypeOf<
		SchemaExtension<
			'postgres.table',
			{ readonly name: 'tenant.posts-v2' },
			'@ultimabase/postgres'
		>
	>()
})

test('requires one string table name', () => {
	// @ts-expect-error -- The explicit override requires a name.
	postgresTable({})
	// @ts-expect-error -- PostgreSQL table names are strings.
	postgresTable({ name: 42 })
	// @ts-expect-error -- Unknown options must not silently affect naming.
	postgresTable({ name: 'posts', namespace: 'public' })
})
