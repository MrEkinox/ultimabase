import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/roles public entry point', () => {
	it('exports only the implemented runtime surface', () => {
		// One explicit manifest prevents package-private reference state from leaking.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'RoleHierarchyError',
			'RoleSchema',
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
