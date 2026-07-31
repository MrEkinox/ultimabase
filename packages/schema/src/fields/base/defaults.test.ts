import { describe, expect, it } from 'vitest'

import { dateTimeField, isStaticDefault, stringField } from '../../index.js'

describe('field defaults', () => {
	it('distinguishes static values without invoking runtime factories', () => {
		let calls = 0
		const factory = (): string => {
			calls += 1

			return 'generated'
		}
		expect(isStaticDefault('static')).toBe(true)
		expect(isStaticDefault(factory)).toBe(false)
		expect(calls).toBe(0)
	})

	it('preserves a runtime factory without executing it during declaration', () => {
		let calls = 0
		const factory = (): string => {
			calls += 1

			return '2026-07-30T12:00:00.000Z'
		}
		const field = dateTimeField({ default: factory })

		expect(field.options.default).toBe(factory)
		expect(calls).toBe(0)
	})

	it('keeps static defaults backward compatible', () => {
		const field = stringField({ default: 'anonymous' })

		expect(field.options.default).toBe('anonymous')
		expect(isStaticDefault(field.options.default)).toBe(true)
	})
})
