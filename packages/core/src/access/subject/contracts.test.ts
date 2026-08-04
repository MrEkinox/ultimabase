import { describe, expect, it } from 'vitest'

import {
	AccessSubjectReference,
	resolveAccessRoleReference,
} from './contracts.js'

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

describe('resolveAccessRoleReference', () => {
	it('accepts direct references and neutral persisted-value carriers', () => {
		const reference = new AccessSubjectReference('role', 'editor')

		expect(resolveAccessRoleReference(reference)).toBe(reference)
		expect(
			resolveAccessRoleReference({
				toAccessRoleReference: () => reference,
			}),
		).toBe(reference)
	})

	it('rejects forged carriers and non-string role identities', () => {
		expect(() =>
			resolveAccessRoleReference({
				toAccessRoleReference: () =>
					new AccessSubjectReference('principal', 'editor') as never,
			}),
		).toThrow(
			new TypeError(
				'Access role subject must provide one string role reference',
			),
		)
		expect(() =>
			resolveAccessRoleReference(
				new AccessSubjectReference('role', 42) as never,
			),
		).toThrow(
			new TypeError(
				'Access role subject must provide one string role reference',
			),
		)
	})
})
