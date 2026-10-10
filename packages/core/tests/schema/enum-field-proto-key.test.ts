import { describe, expect, it } from 'vitest'

import { enumField } from '../../src/index.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// the reference copied an enum mapping with `mapping[key] = value`, so an own
// `__proto__` key vanished. ADR-0310 removed the mapping form; a `__proto__`
// string stays an ordinary enum value and a mapping is refused.

describe('enumField values named __proto__ (reference defect regression)', () => {
	it('keeps a __proto__ value in the declared array', () => {
		const field = enumField({ values: ['__proto__', 'draft'] })

		expect(field.options.values).toStrictEqual(['__proto__', 'draft'])
		expect(Object.isFrozen(field.options.values)).toBe(true)
		expect(
			enumField({ default: '__proto__', values: ['__proto__', 'draft'] })
				.options.default,
		).toBe('__proto__')
	})

	it('refuses a mapping, even one with an own __proto__ key (ADR-0310)', () => {
		const values: Record<string, string> = { Draft: 'draft' }
		Object.defineProperty(values, '__proto__', {
			configurable: true,
			enumerable: true,
			value: 'legacy',
			writable: true,
		})

		expect(() => enumField({ values } as never)).toThrow(
			new TypeError(
				'Enum values must be a non-empty string array or a shared enum from defineEnum',
			),
		)
	})
})
