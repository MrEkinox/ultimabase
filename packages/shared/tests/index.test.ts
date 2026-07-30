import { describe, expect, it } from 'vitest'

import { assertNever, immutableArray, immutableRecord } from '../src/index.js'

describe('assertNever', () => {
	it('reports an unexpected runtime variant', () => {
		// Runtime input can still violate a compile-time union at an untrusted boundary.
		const unexpectedVariant = 'unknown-variant' as never

		expect(() => assertNever(unexpectedVariant)).toThrow(
			new TypeError('Unexpected value: unknown-variant'),
		)
	})
})

describe('immutableArray', () => {
	it('returns a frozen copy that cannot observe source mutations', () => {
		const source = ['first', 'second']
		const immutable = immutableArray(source)

		source.push('third')

		expect(immutable).toStrictEqual(['first', 'second'])
		expect(Object.isFrozen(immutable)).toBe(true)
		expect(Reflect.set(immutable, 0, 'changed')).toBe(false)
	})
})

describe('immutableRecord', () => {
	it('returns a frozen copy that cannot observe source mutations', () => {
		const source = { kind: 'string', required: true }
		const immutable = immutableRecord(source)

		source.kind = 'number'

		expect(immutable).toStrictEqual({ kind: 'string', required: true })
		expect(Object.isFrozen(immutable)).toBe(true)
		expect(Reflect.set(immutable, 'kind', 'changed')).toBe(false)
	})
})
