import { describe, expect, it } from 'vitest'

import { accessModes } from './access.js'

describe('request access modes', () => {
	it('exposes only the immutable anonymous, user, and master set', () => {
		expect(accessModes).toStrictEqual(['anonymous', 'user', 'master'])
		expect(Object.isFrozen(accessModes)).toBe(true)
	})
})
