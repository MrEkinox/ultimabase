import { describe, expect, it } from 'vitest'

import {
	mutationHookFamilies,
	operationHookFamilies,
	saveHookFamilies,
} from './family-keys.js'

describe('hook family keys', () => {
	it('shares frozen family vocabularies from narrow to broad phases', () => {
		expect(saveHookFamilies).toStrictEqual(['create', 'update', 'upsert'])
		expect(mutationHookFamilies).toStrictEqual([
			'create',
			'update',
			'upsert',
			'delete',
		])
		expect(operationHookFamilies).toStrictEqual([
			'create',
			'update',
			'upsert',
			'delete',
			'read',
		])

		// Global descriptors must not be mutable through JavaScript consumers.
		expect(Object.isFrozen(saveHookFamilies)).toBe(true)
		expect(Object.isFrozen(mutationHookFamilies)).toBe(true)
		expect(Object.isFrozen(operationHookFamilies)).toBe(true)
	})
})
