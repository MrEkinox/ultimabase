import { describe, expect, it } from 'vitest'

import {
	assertExactEnumerableKeys,
	assertExactObjectKeys,
	assertExactPlainObject,
} from './exact-object-validation.js'

describe('exact object validation', () => {
	it('preserves the caller-owned unknown-key diagnostic', () => {
		expect(() => {
			assertExactObjectKeys(
				{ accepted: true, unexpected: true },
				new Set(['accepted']),
				'Fixture contains unknown option: ',
			)
		}).toThrow('Fixture contains unknown option: unexpected')
	})

	it('rejects symbol keys through the same exact-key boundary', () => {
		const unexpected = Symbol('unexpected')
		expect(() => {
			assertExactObjectKeys(
				{ [unexpected]: true },
				new Set(),
				'Unknown fixture key: ',
			)
		}).toThrow('Unknown fixture key: Symbol(unexpected)')
	})

	it('keeps enumerable-only callers insensitive to symbol keys', () => {
		const accepted = Symbol('historically ignored')
		expect(() => {
			assertExactEnumerableKeys(
				{ [accepted]: true, known: true },
				new Set(['known']),
				'Unknown enumerable key: ',
			)
		}).not.toThrow()
	})

	it('reports the first enumerable unknown key in object order', () => {
		expect(() => {
			assertExactEnumerableKeys(
				{ first: true, second: true },
				new Set(),
				'Unknown enumerable key: ',
			)
		}).toThrow('Unknown enumerable key: first')
	})

	it('checks the plain-object boundary before its keys', () => {
		expect(() => {
			assertExactPlainObject(
				[],
				new Set(),
				'Fixture must be a plain object',
				'Unknown fixture option: ',
			)
		}).toThrow('Fixture must be a plain object')
	})
})
