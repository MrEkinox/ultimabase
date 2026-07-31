import { describe, expect, it } from 'vitest'

import { QueryCursorError } from './error.js'

describe('QueryCursorError', () => {
	it('exposes a stable typed code and native cause', () => {
		const cause = new Error('signature mismatch')
		const error = new QueryCursorError('CURSOR_INVALID', 'Cursor is invalid', {
			cause,
		})

		expect(error).toBeInstanceOf(Error)
		expect(error.name).toBe('QueryCursorError')
		expect(error.code).toBe('CURSOR_INVALID')
		expect(error.message).toBe('Cursor is invalid')
		expect(error.cause).toBe(cause)
	})

	it('rejects forged error declarations at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects JavaScript callers.
			new QueryCursorError('UNKNOWN_CURSOR', 'Unknown cursor')
		}).toThrow(new TypeError('cursor error code must be a declared code'))
		expect(() => new QueryCursorError('CURSOR_INCOMPATIBLE', '')).toThrow(
			new TypeError('cursor error message must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime validation rejects non-string messages.
			new QueryCursorError('CURSOR_INVALID', 42)
		}).toThrow(new TypeError('cursor error message must be a non-empty string'))
	})
})
