import { Schema, type Pointer } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	PasswordUser,
	PasswordUserSchema,
	passwordAuthPlugin,
	type PasswordAuthPlugin,
	type PasswordPrincipal,
	type PasswordUserDefinition,
} from './index.js'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
	indexes: [{ fields: ['displayName', 'username'] }],
})

test('retains nominal User and principal typing', () => {
	expectTypeOf(AppUser).toExtend<PasswordUserDefinition>()
	expectTypeOf(PasswordUser).toExtend<PasswordUserDefinition>()
	expectTypeOf(
		passwordAuthPlugin({ user: AppUser }),
	).toEqualTypeOf<PasswordAuthPlugin>()
	expectTypeOf<PasswordPrincipal<typeof AppUser>['user']>().toEqualTypeOf<
		Pointer<typeof AppUser>
	>()
})

test('rejects arbitrary schemas and reserved custom fields', () => {
	const ForeignUser = Schema.define({ className: 'User', fields: () => ({}) })
	passwordAuthPlugin({
		// @ts-expect-error -- Password Auth accepts only its exact final composition point.
		user: ForeignUser,
	})

	// @ts-expect-error -- The canonical identity field belongs to Password Auth.
	PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({ username: field.string() }),
	})
	// @ts-expect-error -- Password material cannot become ordinary User data.
	PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({ password: field.string() }),
	})
})

test('keeps password configuration exact and bounded at runtime', () => {
	passwordAuthPlugin({
		password: {
			memoryCostKiB: 65_536,
			parallelism: 4,
			policyVersion: 2,
			timeCost: 3,
		},
	})
	passwordAuthPlugin({
		password: {
			// @ts-expect-error -- Argon2id is the fixed v1 algorithm.
			algorithm: 'scrypt',
		},
	})
})
