import { expectTypeOf, test } from 'vitest'

import { PublicError, type PublicErrorPayload } from '../index.js'

test('keeps the literal code and details of an application error', () => {
	const error = new PublicError('A title cannot contain a link.', {
		code: 'todo.title-link',
		details: { field: 'title' },
	})

	expectTypeOf(error.code).toEqualTypeOf<'todo.title-link'>()
	expectTypeOf(error.toJSON()).toEqualTypeOf<
		PublicErrorPayload<'todo.title-link', { readonly field: 'title' }>
	>()
	expectTypeOf(error.toJSON().message).toEqualTypeOf<string>()
})

test('defaults the code type to APPLICATION_ERROR', () => {
	expectTypeOf(new PublicError('Refused.').code).toEqualTypeOf<
		'APPLICATION_ERROR'
	>()
})
