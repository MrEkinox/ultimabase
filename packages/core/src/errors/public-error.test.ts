import { describe, expect, it } from 'vitest'

import { PublicError, frameworkErrorCodes } from '../index.js'

describe('PublicError', () => {
	it('shows its message, code and details to clients', () => {
		const cause = new Error('regex engine detail')
		const error = new PublicError('A title cannot contain a link.', {
			code: 'todo.title-link',
			details: { field: 'title' },
			cause,
		})

		expect(error).toBeInstanceOf(Error)
		expect(error).toMatchObject({
			name: 'PublicError',
			code: 'todo.title-link',
			message: 'A title cannot contain a link.',
			retryable: false,
			cause,
		})
		expect(Object.isFrozen(error)).toBe(true)
		expect(error.toJSON()).toStrictEqual({
			code: 'todo.title-link',
			retryable: false,
			message: 'A title cannot contain a link.',
			details: { field: 'title' },
		})
		expect(Object.isFrozen(error.toJSON())).toBe(true)
		// The cause is never serialized.
		expect(JSON.stringify(error)).not.toContain('regex engine detail')
	})

	it('defaults the code to APPLICATION_ERROR', () => {
		expect(new PublicError('Refused.').toJSON()).toStrictEqual({
			code: 'APPLICATION_ERROR',
			retryable: false,
			message: 'Refused.',
		})
	})

	it('accepts constant and dot-namespaced codes', () => {
		expect(new PublicError('x', { code: 'QUOTA_EXCEEDED' }).code).toBe(
			'QUOTA_EXCEEDED',
		)
		expect(new PublicError('x', { code: 'billing.quota-exceeded' }).code).toBe(
			'billing.quota-exceeded',
		)
	})

	it.each(frameworkErrorCodes)('rejects the framework code %s', (code) => {
		expect(() => new PublicError('Impersonation', { code })).toThrow(
			new TypeError(`PublicError code cannot reuse the framework code ${code}`),
		)
	})

	it('rejects malformed codes, messages, details and options', () => {
		expect(() => new PublicError('x', { code: 'Not a code' })).toThrow(
			new TypeError(
				'PublicError code must be namespaced or a constant identifier: Not a code',
			),
		)
		expect(() => new PublicError('')).toThrow(
			new TypeError('PublicError message must be a non-empty string'),
		)
		expect(
			// @ts-expect-error -- Runtime coverage rejects array details.
			() => new PublicError('x', { details: [] }),
		).toThrow(new TypeError('PublicError details must be a plain object'))
		expect(
			// @ts-expect-error -- Runtime coverage rejects unknown options.
			() => new PublicError('x', { status: 418 }),
		).toThrow(new TypeError('Unknown PublicError option: status'))
		expect(
			// @ts-expect-error -- Runtime coverage rejects null options.
			() => new PublicError('x', null),
		).toThrow(new TypeError('Public error options must be a plain object'))
	})
})
