import { RequestSubjectReference } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	requestRoleResolverCapability,
	resolveRequestRoleReference,
} from './index.js'

// The role contract left Core for plugin-kit (ADR-0329).
describe('resolveRequestRoleReference', () => {
	it('accepts direct references only', () => {
		const reference = new RequestSubjectReference('role', 'editor')

		expect(resolveRequestRoleReference(reference)).toBe(reference)
	})

	it('rejects value carriers and non-string role identities', () => {
		// Role results are plain data without a reference method (ADR-0310).
		expect(() =>
			resolveRequestRoleReference({
				toRequestRoleReference: () => new RequestSubjectReference('role', 'x'),
			} as never),
		).toThrow(
			new TypeError(
				'Request role subject must provide one string role reference',
			),
		)
		expect(() =>
			resolveRequestRoleReference(
				new RequestSubjectReference('role', 42) as never,
			),
		).toThrow(
			new TypeError(
				'Request role subject must provide one string role reference',
			),
		)
	})
})

describe('requestRoleResolverCapability', () => {
	it('keeps its protocol identity and a hint that names no plugin package', () => {
		expect(requestRoleResolverCapability.capabilityId).toBe(
			'ultimabase.request-subject.role-resolver',
		)
		expect(requestRoleResolverCapability.version).toBe('1.0.0')
		expect(requestRoleResolverCapability.hint).toEqual(expect.any(String))
		expect(requestRoleResolverCapability.hint).not.toMatch(
			/@ultimabase\/|-plugin\b|[a-z]+Plugin\(/u,
		)
	})
})
