import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/roles-plugin public entry point', () => {
	it('exports only the implemented runtime surface', () => {
		// One explicit manifest prevents package-private reference state from leaking.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'RoleDeletionError',
			'RoleHierarchyError',
			'RoleReferenceResolutionError',
			'RoleSchema',
			'hasRole',
			'resolveRoleReference',
			'resolveRoleReferenceId',
			'roleDeletedEvent',
			'roleHierarchyChangedEvent',
			'roleHierarchyMaxDepth',
			'roleHierarchyMaxVisitedRoles',
			'roleMembershipChangedEvent',
			'roleSchemaExtensionName',
			'rolesPlugin',
			'rolesPluginName',
		])
	})
})
