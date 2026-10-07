import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createRoleReference } from './role-reference.js'
import {
	resolveRoleReferenceId,
	resolveUniqueRoleNameMatch,
} from './role-resolution.js'
import type { RoleReferenceResolutionError } from './role-resolution.js'

const RoleFixture = UltimaBase.Schema.define({
	className: 'ResolvedRoleFixture',
	fields: () => ({}),
})

describe('role reference resolution', () => {
	it('returns explicit UUID selectors without performing name lookup', async () => {
		const id = '123e4567-e89b-42d3-a456-426614174000'

		await expect(
			resolveRoleReferenceId(createRoleReference(RoleFixture, { id })),
		).resolves.toBe(id)
	})

	it('selects exactly one normalized-name match', () => {
		const role = { id: 'role-1', name: 'editor' }

		expect(resolveUniqueRoleNameMatch('editor', [role])).toBe(role)
		expect(() => resolveUniqueRoleNameMatch('missing', [])).toThrow(
			expect.objectContaining({
				code: 'ROLE_REFERENCE_UNKNOWN',
			}) as Partial<RoleReferenceResolutionError>,
		)
		expect(() =>
			resolveUniqueRoleNameMatch('editor', [role, { ...role, id: 'role-2' }]),
		).toThrow(
			expect.objectContaining({
				code: 'ROLE_REFERENCE_AMBIGUOUS',
			}) as Partial<RoleReferenceResolutionError>,
		)
	})
})
