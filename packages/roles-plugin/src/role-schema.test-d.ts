import { Schema } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import { RoleSchema, hasRole } from './index.js'

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
