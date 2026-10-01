import { UltimaBase, type Pointer, type SchemaResult } from '@ultimabase/core'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { expectTypeOf, test } from 'vitest'

import {
	PasswordUser,
	PasswordUserSchema,
	passwordAuthPlugin,
	type PasswordAuthPlugin,
	type PasswordPrincipal,
	type PasswordUserReference,
	type PasswordAuthenticationResult,
	type PasswordChangeResult,
	type PasswordLogoutResult,
} from './index.js'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		nickname: field.string(),
		locale: field.string({ required: true, default: 'fr' }),
	}),
	indexes: [{ fields: ['displayName', 'username'] }],
})

test('infers configured plugin builders and signup fields without a generated registry', () => {
	const Base = UltimaBase.use(pgVectorPlugin())
	const User = PasswordUserSchema.define(Base.Schema, {
		className: 'User',
		fields: (field) => ({
			displayName: field.string({ required: true }),
			embedding: field.vector({ dimensions: 3 }),
		}),
		indexes: [{ fields: ['displayName', 'username'] }],
	})
	const credentials = { username: 'Ada', password: 'secret' }
	void User.signUp({ ...credentials, displayName: 'Ada', embedding: [1, 2, 3] })
	expectTypeOf(User).toExtend<PasswordUserReference>()
	// @ts-expect-error -- Configured declaration preserves required profile inputs.
	void User.signUp(credentials)
	// @ts-expect-error -- Plugin values retain their source-defined input type.
	void User.signUp({ ...credentials, displayName: 'Ada', embedding: 'invalid' })
	PasswordUserSchema.define(UltimaBase.Schema, {
		className: 'User',
		fields: (field) => {
			// @ts-expect-error -- A plugin method belongs only to its configured factory.
			void field.vector
			return {}
		},
	})
	PasswordUserSchema.define(Base.Schema, {
		className: 'User',
		fields: (field) => ({
			// @ts-expect-error -- Plugin builder options preserve exact value types.
			embedding: field.vector({ dimensions: 'three' }),
		}),
	})
	// @ts-expect-error -- Configured users cannot replace package-owned fields.
	PasswordUserSchema.define(Base.Schema, {
		className: 'User',
		fields: (field) => ({ passwordHash: field.string() }),
	})
})

test('types class authentication results against the exact User and rejects extra options', () => {
	const credentials = {
		username: 'Ada',
		password: 'correct horse battery staple',
	}
	expectTypeOf(
		AppUser.signUp({ ...credentials, displayName: 'Ada Lovelace' }),
	).toEqualTypeOf<Promise<PasswordAuthenticationResult<typeof AppUser>>>()
	expectTypeOf(AppUser.login(credentials)).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof AppUser>>
	>()
	expectTypeOf(AppUser.refresh('token')).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof AppUser>>
	>()
	expectTypeOf(AppUser.logout('token')).toEqualTypeOf<
		Promise<PasswordLogoutResult>
	>()
	expectTypeOf(AppUser.logoutEverywhere()).toEqualTypeOf<
		Promise<PasswordLogoutResult>
	>()
	expectTypeOf(
		AppUser.changePassword({
			currentPassword: credentials.password,
			newPassword: 'another correct horse battery staple',
		}),
	).toEqualTypeOf<Promise<PasswordChangeResult>>()
	expectTypeOf(AppUser.current()).toEqualTypeOf<
		Promise<SchemaResult<typeof AppUser>>
	>()
	expectTypeOf(PasswordUser.signUp(credentials)).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof PasswordUser>>
	>()
	// @ts-expect-error -- Required profile fields are mandatory for signup.
	void AppUser.signUp(credentials)
	// @ts-expect-error -- Profile values retain their declared types.
	void AppUser.signUp({ ...credentials, displayName: 42 })
	// @ts-expect-error -- Login never accepts profile fields.
	void AppUser.login({ ...credentials, displayName: 'Ada' })
	void AppUser.signUp({
		...credentials,
		displayName: 'Ada',
		// @ts-expect-error -- Unknown profile fields are rejected.
		unknownField: true,
	})
	// @ts-expect-error -- Credentials require both username and password.
	void AppUser.signUp({ username: 'Ada' })
	// @ts-expect-error -- Session objects cannot replace the exact raw token.
	void AppUser.refresh({ token: 'token' })
	// @ts-expect-error -- Authentication does not introduce a caller elevation option.
	void AppUser.login(credentials, { useMasterKey: true })
	// @ts-expect-error -- The token is explicit even inside an authenticated request.
	void AppUser.logout()
	// @ts-expect-error -- Password replacement requires both secrets.
	void AppUser.changePassword({ currentPassword: credentials.password })
	// @ts-expect-error -- Account-scoped methods accept no target User identity.
	void AppUser.logoutEverywhere({ userId: 'another-user' })
})

test('retains nominal User and principal typing', () => {
	expectTypeOf(AppUser).toExtend<PasswordUserReference>()
	expectTypeOf(PasswordUser).toExtend<PasswordUserReference>()
	expectTypeOf(
		passwordAuthPlugin({ user: AppUser }),
	).toEqualTypeOf<PasswordAuthPlugin>()
	expectTypeOf<PasswordPrincipal<typeof AppUser>['user']>().toEqualTypeOf<
		Pointer<typeof AppUser>
	>()
})

test('rejects arbitrary schemas and reserved custom fields', () => {
	const ForeignUser = UltimaBase.Schema.define({
		className: 'User',
		fields: () => ({}),
	})
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

test('uses ordinary nested-create commands for relationship fields', () => {
	const Team = UltimaBase.Schema.define({
		className: 'Team',
		fields: (field) => ({ name: field.string() }),
	})
	const User = PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({
			team: field.pointer({ target: 'Team', required: true }),
		}),
	})
	const credentials = {
		username: 'Ada',
		password: 'correct horse battery staple',
	}
	void User.signUp({ ...credentials, team: { connect: 'team-id' } })
	// @ts-expect-error -- A required relationship must be provided on signup.
	void User.signUp(credentials)
	// @ts-expect-error -- Creation uses commands rather than materialized pointers.
	void User.signUp({ ...credentials, team: Team.pointer('team-id') })
})
