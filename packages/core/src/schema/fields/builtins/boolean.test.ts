import { describe, expect, it } from 'vitest'

import { booleanField } from '../../index.js'

describe('booleanField', () => {
	it('creates frozen default metadata', () => {
		const field = booleanField()

		expect(field).toStrictEqual({
			kind: 'boolean',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves a static default and common metadata', () => {
		const field = booleanField({
			required: true,
			default: false,
			immutable: true,
			indexed: true,
			description: 'Feature enabled state',
		})

		expect(field.options).toStrictEqual({
			required: true,
			default: false,
			immutable: true,
			indexed: true,
			description: 'Feature enabled state',
		})
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('copies caller-owned presence metadata', () => {
		const source: { required: boolean } = { required: false }
		const field = booleanField(source)

		source.required = true

		// Presence metadata remains stable after schema registration.
		expect(field.options.required).toBe(false)
	})
})
