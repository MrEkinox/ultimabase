import { expectTypeOf, test } from 'vitest'

import { postgresColumn, type PostgresColumnExtension } from './column.js'

test('postgresColumn preserves the previous-name literal', () => {
	const extension = postgresColumn({ renamedFrom: 'legacy_title' })

	expectTypeOf(extension).toEqualTypeOf<
		PostgresColumnExtension<'legacy_title'>
	>()

	// @ts-expect-error -- renamedFrom is required for deterministic rename intent.
	postgresColumn({})
})
