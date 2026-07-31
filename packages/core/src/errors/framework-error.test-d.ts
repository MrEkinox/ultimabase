import { expectTypeOf, test } from 'vitest'

import {
	FrameworkError,
	frameworkErrorCodes,
	type FrameworkErrorCode,
	type FrameworkErrorPayload,
} from '../index.js'

test('preserves exact error codes and detail records', () => {
	const cause: unknown = new Error('database failure')
	const error = new FrameworkError('NOT_FOUND', 'User row was absent', {
		cause,
		publicDetails: { resource: 'User', id: 'user-id' },
		internalDetails: { table: 'users', shard: 4 },
	})

	expectTypeOf(error.code).toEqualTypeOf<'NOT_FOUND'>()
	expectTypeOf(error.cause).toEqualTypeOf<unknown>()
	expectTypeOf(error.publicDetails).toEqualTypeOf<
		Readonly<{ readonly resource: 'User'; readonly id: 'user-id' }> | undefined
	>()
	expectTypeOf(error.internalDetails).toEqualTypeOf<
		Readonly<{ readonly table: 'users'; readonly shard: 4 }> | undefined
	>()
	expectTypeOf(error.toJSON()).toEqualTypeOf<
		FrameworkErrorPayload<
			'NOT_FOUND',
			{ readonly resource: 'User'; readonly id: 'user-id' }
		>
	>()
})

test('keeps framework codes closed and immutable', () => {
	expectTypeOf<
		(typeof frameworkErrorCodes)[number]
	>().toEqualTypeOf<FrameworkErrorCode>()

	// @ts-expect-error -- Framework codes are a closed transport contract.
	new FrameworkError('COMMUNITY_FAILURE', 'Plugin failed')
	// @ts-expect-error -- The exported code list cannot be mutated.
	frameworkErrorCodes[0] = 'INTERNAL_ERROR'

	const error = new FrameworkError('PERMISSION_DENIED', 'Rule rejected access')

	// @ts-expect-error -- Error codes remain stable after construction.
	error.code = 'INTERNAL_ERROR'
	// @ts-expect-error -- Retryability remains stable after construction.
	error.retryable = true
})
