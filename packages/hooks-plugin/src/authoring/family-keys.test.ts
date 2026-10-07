import { describe, expect, it } from 'vitest'

import { saveHookFamilies } from './declarations.js'

describe('hook family keys', () => {
	it('keeps the runtime save vocabulary immutable', () => {
		expect(saveHookFamilies).toStrictEqual(['create', 'update', 'upsert'])
		// Global descriptors must not be mutable through JavaScript consumers.
		expect(Object.isFrozen(saveHookFamilies)).toBe(true)
	})
})
