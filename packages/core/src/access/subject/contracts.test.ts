import { describe, expect, it } from 'vitest'

import { AccessSubjectReference } from './contracts.js'

describe('AccessSubjectReference', () => {
	it('retains one immutable provider-neutral subject reference', () => {
		const reference = new AccessSubjectReference('role', 'editor')

		expect(reference).toEqual({ kind: 'role', value: 'editor' })
		expect(Object.isFrozen(reference)).toBe(true)
	})

	it('rejects empty or untrusted subject kinds', () => {
		expect(() => new AccessSubjectReference('', 'editor')).toThrow(
			new TypeError('Access subject kind must be a non-empty string'),
		)
		expect(
			() =>
				new AccessSubjectReference(
					// @ts-expect-error -- Runtime validation protects JavaScript callers.
					42,
					'editor',
				),
		).toThrow(new TypeError('Access subject kind must be a non-empty string'))
	})
})
