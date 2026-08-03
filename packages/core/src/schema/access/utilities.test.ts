import { describe, expect, it } from 'vitest'

import { allMutations, allOperations, allowAll, denyAll } from './utilities.js'

describe('Access declaration utilities', () => {
	it('exports literal decisions without hidden callback allocation', () => {
		expect(allowAll).toBe(true)
		expect(denyAll).toBe(false)
	})

	it('creates a fresh immutable complete operation declaration', () => {
		const rule = () => true
		const first = allOperations(rule)
		const second = allOperations(rule)

		expect(first).toStrictEqual({
			create: rule,
			delete: rule,
			read: rule,
			update: rule,
			upsert: rule,
		})
		expect(Object.values(first).every((value) => value === rule)).toBe(true)
		expect(Object.isFrozen(first)).toBe(true)
		expect(first).not.toBe(second)
	})

	it('creates mutation-only declarations and supports native overrides', () => {
		const mutations = allMutations(denyAll)
		const readOnly = { ...mutations, read: allowAll }

		expect(mutations).toStrictEqual({
			create: false,
			delete: false,
			update: false,
			upsert: false,
		})
		expect(mutations).not.toHaveProperty('read')
		expect(Object.isFrozen(mutations)).toBe(true)
		expect(readOnly).toStrictEqual({
			create: false,
			delete: false,
			read: true,
			update: false,
			upsert: false,
		})
	})
})
