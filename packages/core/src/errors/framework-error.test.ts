import { describe, expect, it } from 'vitest'

import { FrameworkError, frameworkErrorCodes } from '../index.js'

describe('FrameworkError', () => {
	it('publishes one immutable set of stable framework codes', () => {
		expect(frameworkErrorCodes).toStrictEqual([
			'VALIDATION_ERROR',
			'NOT_FOUND',
			'PERMISSION_DENIED',
			'MASTER_ACCESS_DENIED',
			'MISSING_EXECUTION_CONTEXT',
			'PLUGIN_DEPENDENCY_MISSING',
			'PLUGIN_DEPENDENCY_CYCLE',
			'PLUGIN_DUPLICATE',
			'PLUGIN_CONFLICT',
			'PLUGIN_EXTENSION_HANDLER_MISSING',
			'HOOK_RECURSION',
			'OPERATION_CANCELLED',
			'TRANSACTION_ERROR',
			'INTERNAL_ERROR',
			'SERVICE_NOT_FOUND',
			'SERVICE_ALREADY_PROVIDED',
			'SERVICE_REGISTRY_DISPOSED',
		])
		expect(Object.isFrozen(frameworkErrorCodes)).toBe(true)
	})

	it('separates public serialization from diagnostic state', () => {
		const cause = new Error('socket password: secret')
		const publicDetails = { resource: 'User', id: 'missing-user' }
		const internalDetails = { query: 'select secret_column from users' }
		const error = new FrameworkError('NOT_FOUND', 'Database row was absent', {
			cause,
			publicMessage: 'The requested user was not found.',
			publicDetails,
			internalDetails,
			retryable: false,
		})

		expect(error).toMatchObject({
			name: 'FrameworkError',
			code: 'NOT_FOUND',
			message: 'Database row was absent',
			cause,
			retryable: false,
			publicMessage: 'The requested user was not found.',
			publicDetails,
			internalDetails,
		})
		expect(error.publicDetails).not.toBe(publicDetails)
		expect(error.internalDetails).not.toBe(internalDetails)
		expect(Object.isFrozen(error)).toBe(true)
		expect(Object.isFrozen(error.publicDetails)).toBe(true)
		expect(Object.isFrozen(error.internalDetails)).toBe(true)

		const payload = error.toJSON()

		expect(payload).toStrictEqual({
			code: 'NOT_FOUND',
			retryable: false,
			message: 'The requested user was not found.',
			details: publicDetails,
		})
		expect(Object.isFrozen(payload)).toBe(true)
		expect(JSON.parse(JSON.stringify(error))).toStrictEqual(payload)
		expect(JSON.stringify(error)).not.toContain('Database row was absent')
		expect(JSON.stringify(error)).not.toContain('secret')
	})

	it('omits optional public values and defaults retryable to false', () => {
		const error = new FrameworkError(
			'INTERNAL_ERROR',
			'Internal diagnostic message',
		)

		expect(error.retryable).toBe(false)
		expect(error.publicMessage).toBeUndefined()
		expect(error.publicDetails).toBeUndefined()
		expect(error.internalDetails).toBeUndefined()
		expect(error.toJSON()).toStrictEqual({
			code: 'INTERNAL_ERROR',
			retryable: false,
		})
	})

	it('preserves native cause chains by identity', () => {
		const rootCause = new Error('connection closed')
		const transactionError = new FrameworkError(
			'TRANSACTION_ERROR',
			'Transaction failed',
			{ cause: rootCause, retryable: true },
		)
		const outerError = new FrameworkError(
			'INTERNAL_ERROR',
			'Operation failed',
			{ cause: transactionError },
		)

		expect(outerError.cause).toBe(transactionError)
		expect(transactionError.cause).toBe(rootCause)
		expect(transactionError.retryable).toBe(true)
	})

	it('protects JavaScript callers from malformed error metadata', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage rejects codes outside the closed union.
			new FrameworkError('UNKNOWN', 'Unknown failure')
		}).toThrow(new TypeError('Unknown framework error code: UNKNOWN'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects untyped message values.
			new FrameworkError('INTERNAL_ERROR', 42)
		}).toThrow(new TypeError('message must be a non-empty string'))
		expect(() => {
			new FrameworkError('INTERNAL_ERROR', '')
		}).toThrow(new TypeError('message must be a non-empty string'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects null JavaScript options.
			new FrameworkError('INTERNAL_ERROR', 'Failure', null)
		}).toThrow(new TypeError('Framework error options must be a plain object'))
		expect(() => {
			new FrameworkError('INTERNAL_ERROR', 'Failure', {
				publicMessage: '',
			})
		}).toThrow(new TypeError('publicMessage must be a non-empty string'))
		expect(() => {
			new FrameworkError('INTERNAL_ERROR', 'Failure', {
				// @ts-expect-error -- Runtime coverage rejects non-boolean retry metadata.
				retryable: 'yes',
			})
		}).toThrow(new TypeError('retryable must be a boolean'))
		expect(() => {
			new FrameworkError('INTERNAL_ERROR', 'Failure', {
				// @ts-expect-error -- Public details must retain a named record shape.
				publicDetails: [],
			})
		}).toThrow(new TypeError('publicDetails must be a plain object'))
		expect(() => {
			new FrameworkError('INTERNAL_ERROR', 'Failure', {
				// @ts-expect-error -- Internal details must retain a named record shape.
				internalDetails: null,
			})
		}).toThrow(new TypeError('internalDetails must be a plain object'))
	})
})
