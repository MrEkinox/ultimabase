import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/acl-permissions-plugin public entry point', () => {
	it('exports only the implemented ACL value and schema-extension surface', () => {
		// One explicit manifest prevents package-private immutable state from leaking.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'ACL',
			'acl',
			'aclFieldKind',
			'aclFieldName',
			'aclPermissions',
			'aclPlugin',
			'aclPluginName',
			'aclRowConstraintKind',
			'aclRowConstraintVersion',
			'aclSchemaExtensionName',
		])
	})
})
