import { describe, expect, it } from 'vitest'

import { assertSingularRoleDeletion } from './role-deletion.js'
import type { RoleDeletionError } from './role-deletion.js'

describe('role deletion policy', () => {
	it('accepts singular deletion and rejects set-based bypasses', () => {
		expect(() => {
			assertSingularRoleDeletion({ kind: 'delete-one' })
		}).not.toThrow()
		expect(() => {
			assertSingularRoleDeletion({ kind: 'delete-many' })
		}).toThrow(
			expect.objectContaining({
				code: 'ROLE_DELETE_BULK_UNSUPPORTED',
			}) as Partial<RoleDeletionError>,
		)
	})
})
