import { describe, expect, it } from 'vitest'

import { accessModes } from './access.js'

describe('request access modes', () => {
	it('exposes only the immutable anonymous and master set', () => {
		expect(accessModes).toStrictEqual(['anonymous', 'master'])
		expect(Object.isFrozen(accessModes)).toBe(true)
	})
})
