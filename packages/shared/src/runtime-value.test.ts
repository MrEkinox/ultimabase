import { describe, expect, it } from 'vitest'

import {
	assertNonEmptyString,
	assertOptionalBoolean,
	isPlainRecord,
	isUnknownArray,
} from './runtime-value.js'

describe('runtime value guards', () => {
	it('accepts only records with plain or null prototypes', () => {
		const nullPrototypeRecord: Record<string, unknown> = {}

		// A native mutation avoids Object.create's untyped legacy return value.
		Object.setPrototypeOf(nullPrototypeRecord, null)

		expect(isPlainRecord({ value: true })).toBe(true)
		expect(isPlainRecord(nullPrototypeRecord)).toBe(true)
		expect(isPlainRecord([])).toBe(false)
		expect(isPlainRecord(new Map())).toBe(false)
		expect(isPlainRecord(null)).toBe(false)
	})

	it('narrows arrays without trusting their element type', () => {
		expect(isUnknownArray(['value'])).toBe(true)
		expect(isUnknownArray({ 0: 'value' })).toBe(false)
	})

	it('accepts non-empty strings and rejects invalid identifiers', () => {
		expect(() => {
			assertNonEmptyString('User', 'className')
		}).not.toThrow()
		expect(() => {
			assertNonEmptyString('', 'className')
		}).toThrow(new TypeError('className must be a non-empty string'))
		expect(() => {
			assertNonEmptyString(1, 'className')
		}).toThrow(new TypeError('className must be a non-empty string'))
	})

	it('accepts optional booleans without coercion', () => {
		expect(() => {
			assertOptionalBoolean(undefined, 'enabled')
		}).not.toThrow()
		expect(() => {
			assertOptionalBoolean(false, 'enabled')
		}).not.toThrow()
		expect(() => {
			assertOptionalBoolean('false', 'enabled')
		}).toThrow(new TypeError('enabled must be a boolean'))
	})
})
