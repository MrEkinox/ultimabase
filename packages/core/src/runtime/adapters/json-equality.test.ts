import { describe, expect, it } from 'vitest'

import { equalJsonValues } from './json-equality.js'

describe('portable JSON equality', () => {
	it('ignores object property order recursively', () => {
		expect(
			equalJsonValues(
				{ mode: 'safe', nested: { indexed: true, nullable: false } },
				{ nested: { nullable: false, indexed: true }, mode: 'safe' },
			),
		).toBe(true)
	})

	it('preserves array order and primitive values', () => {
		expect(
			equalJsonValues(['draft', 'published'], ['published', 'draft']),
		).toBe(false)
		expect(equalJsonValues('draft', 'published')).toBe(false)
	})

	it('treats positive and negative zero as the same JSON number', () => {
		expect(equalJsonValues(0, -0)).toBe(true)
	})
})
