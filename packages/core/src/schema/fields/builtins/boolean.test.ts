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
			validation: {
				required: true,
			},
			default: false,
			immutable: true,
			indexed: true,
			description: 'Feature enabled state',
		})

		expect(field.options).toStrictEqual({
			validation: {
				required: true,
			},
			default: false,
			immutable: true,
			indexed: true,
			description: 'Feature enabled state',
		})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('copies caller-owned validation metadata', () => {
		const source = {
			validation: {
				required: false,
			},
		}
		const field = booleanField(source)

		source.validation.required = true

		// Presence metadata remains stable after schema registration.
		expect(field.options.validation?.required).toBe(false)
	})
})
