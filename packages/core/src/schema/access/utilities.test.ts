import { describe, expect, it } from 'vitest'

import type { AccessContext } from '../../access/index.js'
import {
	allMutations,
	allOf,
	allOperations,
	allowAll,
	anyOf,
	denyAll,
	not,
} from './utilities.js'

const createAccessInput = (
	signal: AbortSignal = new AbortController().signal,
): { readonly context: AccessContext } => ({
	context: {
		access: { mode: 'anonymous' },
		getValue: () => undefined,
		hasCapability: () => false,
		requestId: 'access-utility-test',
		signal,
		source: 'test',
	},
})

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

	it('short-circuits synchronous and asynchronous OR decisions in order', async () => {
		const calls: string[] = []
		const decision = anyOf(
			() => {
				calls.push('first')

				return false
			},
			async () => {
				calls.push('second')

				return Promise.resolve(true)
			},
			() => {
				calls.push('unreachable')

				return true
			},
		)

		if (typeof decision !== 'function') {
			throw new TypeError('Fixture requires a composed Access callback')
		}

		await expect(decision(createAccessInput())).resolves.toBe(true)
		expect(calls).toStrictEqual(['first', 'second'])
	})

	it('short-circuits AND decisions and simplifies setup-time constants', async () => {
		const callback = () => Promise.resolve(true)
		const decision = allOf(
			callback,
			() => false,
			() => true,
		)

		if (typeof decision !== 'function') {
			throw new TypeError('Fixture requires a composed Access callback')
		}

		await expect(decision(createAccessInput())).resolves.toBe(false)
		expect(anyOf(false, callback)).toBe(callback)
		expect(allOf(true, callback)).toBe(callback)
		expect(anyOf(true, callback)).toBe(true)
		expect(allOf(false, callback)).toBe(false)
		expect(not(true)).toBe(false)
	})

	it('inverts callbacks and observes cancellation between decisions', async () => {
		const controller = new AbortController()
		const inverted = not(() => false)
		const cancelled = anyOf(
			async () => {
				controller.abort(new Error('cancelled Access composition'))

				return Promise.resolve(false)
			},
			() => true,
		)

		if (typeof inverted !== 'function' || typeof cancelled !== 'function') {
			throw new TypeError('Fixture requires composed Access callbacks')
		}

		await expect(inverted(createAccessInput())).resolves.toBe(true)
		await expect(
			cancelled(createAccessInput(controller.signal)),
		).rejects.toThrow('cancelled Access composition')
	})

	it('rejects empty, arity-invalid, and non-boolean declarations', async () => {
		expect(() => (anyOf as (...rules: readonly never[]) => unknown)()).toThrow(
			new TypeError('anyOf requires at least one Access decision'),
		)
		expect(() => (allOf as (...rules: readonly never[]) => unknown)()).toThrow(
			new TypeError('allOf requires at least one Access decision'),
		)
		expect(() => (not as (...rules: readonly never[]) => unknown)()).toThrow(
			new TypeError('not requires exactly one Access decision'),
		)

		const invalid = anyOf(
			() => false,
			() => 'allow' as unknown as boolean,
		)

		if (typeof invalid !== 'function') {
			throw new TypeError('Fixture requires a composed Access callback')
		}

		await expect(invalid(createAccessInput())).rejects.toThrow(
			new TypeError('Access decision must return a boolean'),
		)
	})
})
