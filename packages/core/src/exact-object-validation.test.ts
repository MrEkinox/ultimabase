import { describe, expect, it } from 'vitest'

import {
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
