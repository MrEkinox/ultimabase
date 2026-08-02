import { describe, expect, it } from 'vitest'

import { RequestCapability } from './capability.js'

describe('RequestCapability', () => {
	it('creates immutable identity tokens with literal names', () => {
		const first = new RequestCapability('tenant:write')
		const second = new RequestCapability('tenant:write')

		expect(first.name).toBe('tenant:write')
		expect(first).not.toBe(second)
		expect(Object.isFrozen(first)).toBe(true)
	})

	it('rejects empty names at the JavaScript boundary', () => {
		expect(() => new RequestCapability('')).toThrow(
			new TypeError('Request capability name must be a non-empty string'),
		)
	})
})
