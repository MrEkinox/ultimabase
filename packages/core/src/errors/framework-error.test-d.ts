import { expectTypeOf, test } from 'vitest'

import {
	FrameworkError,
	frameworkErrorCodes,
	throwIfOperationCancelled,
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

test('exposes the stable plugin declaration diagnostic code', () => {
	const error = new FrameworkError(
		'PLUGIN_DECLARATION_INVALID',
		'Plugin schema declaration failed',
	)

	expectTypeOf(error.code).toEqualTypeOf<'PLUGIN_DECLARATION_INVALID'>()
})

test('exposes one typed cooperative cancellation helper', () => {
	const signal = new AbortController().signal

	expectTypeOf(throwIfOperationCancelled).toEqualTypeOf<
		(
			signal: AbortSignal,
			internalDetails?: Readonly<Record<string, unknown>>,
		) => void
	>()
	throwIfOperationCancelled(signal, { phase: 'plugin-callback' })

	// @ts-expect-error -- Diagnostic details retain a named record shape.
	throwIfOperationCancelled(signal, [])
})
