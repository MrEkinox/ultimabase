import { describe, expect, it, vi } from 'vitest'

import {
	readRegisteredPrivateStorageAdapter,
	registerPrivateStorageAdapter,
} from './adapter.js'

describe('private storage adapter registration', () => {
	it('retains one immutable Core-only callback binding outside the adapter object', async () => {
		const adapter = {}
		const execute = vi.fn(() => Promise.resolve(null))
		const implementation = { executePrivateStorage: execute }
		registerPrivateStorageAdapter(adapter, implementation)
		const registered = readRegisteredPrivateStorageAdapter(adapter)

		expect(adapter).not.toHaveProperty('privateStorage')
		expect(registered).toBeDefined()
		expect(Object.isFrozen(registered)).toBe(true)
		await registered?.executePrivateStorage({} as never)
		expect(execute).toHaveBeenCalledOnce()
		expect(() => {
			registerPrivateStorageAdapter(adapter, implementation)
		}).toThrow('Private storage adapter is already registered')
	})

	it('rejects malformed JavaScript implementations', () => {
		expect(() => {
			registerPrivateStorageAdapter({}, {} as never)
		}).toThrow('requires executePrivateStorage')
	})
})
