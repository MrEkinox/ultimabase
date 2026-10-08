import { describe, expect, it } from 'vitest'

import { enumField } from '../../src/index.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// the reference copied an enum mapping with `mapping[key] = value`. An own
// `__proto__` key (only reachable through `JSON.parse` or `defineProperty`) hit
// the inherited `__proto__` setter, which ignores string values, so the entry
// vanished from `options.values` while its value stayed accepted. The declared
// mapping and the accepted domain disagreed. The rebuild keeps the key as an
// ordinary own key.

describe('enumField mapping with an own __proto__ key (reference defect regression)', () => {
	it('keeps the __proto__ entry as an own key of options.values', () => {
		const values: Record<string, string> = { Draft: 'draft' }
		// Object literals cannot declare an own `__proto__` data key; this is the
		// shape `JSON.parse('{"__proto__":"legacy","Draft":"draft"}')` produces.
		Object.defineProperty(values, '__proto__', {
			configurable: true,
			enumerable: true,
			value: 'legacy',
			writable: true,
		})

		const field = enumField({ values })

		expect(Object.hasOwn(field.options.values, '__proto__')).toBe(true)
		expect(
			Object.getOwnPropertyDescriptor(field.options.values, '__proto__')?.value,
		).toBe('legacy')
		expect(Object.keys(field.options.values).sort()).toStrictEqual([
			'Draft',
			'__proto__',
		])
		// The copy is still an ordinary frozen record: its prototype is unchanged.
		expect(Object.getPrototypeOf(field.options.values)).toBe(
			Object.getPrototypeOf(values),
		)
		expect(Object.isFrozen(field.options.values)).toBe(true)
		// The mapping and the accepted domain agree on the `__proto__` entry.
		expect(enumField({ default: 'legacy', values }).options.default).toBe(
			'legacy',
		)
	})
})
