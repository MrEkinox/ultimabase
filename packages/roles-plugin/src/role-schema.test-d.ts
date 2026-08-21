import { Schema } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import { RoleSchema, hasRole, type RoleSchemaIdentityOption } from './index.js'

const User = Schema.define({
	className: 'TypedRoleUser',
	fields: (field) => ({
		email: field.string({ validation: { required: true } }),
	}),
})
const AppRole = RoleSchema.define({
	className: 'TypedAppRole',
	members: { schema: User },
	fields: (field) => ({ description: field.string() }),
})

test('keeps role statics available without reconstructing local item types', () => {
	expectTypeOf(AppRole.role('editor').kind).toEqualTypeOf<'role'>()
	expectTypeOf(hasRole(AppRole.role('editor'))).toBeFunction()
})

test('rejects invalid deletion policies before code generation', () => {
	RoleSchema.define({
		className: 'TypedInvalidDeletionRole',
		members: { schema: User },
		fields: () => ({}),
		deletion: {
			// @ts-expect-error -- Deletion behavior is one closed schema-owned policy.
			references: 'remove',
		},
	})
})

test('keeps the role identity option nominal and out of RoleSchema authoring', () => {
	// @ts-expect-error -- Only RoleSchema.define() may create the opaque marker.
	const forged: RoleSchemaIdentityOption = {}
	void forged

	RoleSchema.define({
		className: 'TypedLegacyExtendedRole',
		members: { schema: User },
		fields: () => ({}),
		// @ts-expect-error -- Direct plugin options replace RoleSchema extensions.
		extensions: [],
	})
})
