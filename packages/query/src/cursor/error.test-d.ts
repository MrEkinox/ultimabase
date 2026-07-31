import { expect, expectTypeOf, test } from 'vitest'

import { QueryCursorError, type QueryCursorErrorCode } from '../index.js'

test('keeps cursor error codes closed and literal', () => {
	const error = new QueryCursorError(
		'CURSOR_INCOMPATIBLE',
		'Cursor belongs to another query',
	)

	expect(error.code).toBe('CURSOR_INCOMPATIBLE')
	expectTypeOf(error.code).toEqualTypeOf<'CURSOR_INCOMPATIBLE'>()
	expectTypeOf<QueryCursorErrorCode>().toEqualTypeOf<
		'CURSOR_INVALID' | 'CURSOR_INCOMPATIBLE'
	>()

	// @ts-expect-error -- Cursor error codes are a closed public union.
	new QueryCursorError('CURSOR_EXPIRED', 'Expired')
})
