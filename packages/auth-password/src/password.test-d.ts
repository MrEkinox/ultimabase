import {
	authPlugin,
	type AuthPluginExports,
	type AuthenticationResult,
} from '@ultimabase/auth-plugin'
import { UltimaBase, type CreateInput, type Model } from '@ultimabase/core'
import type { PluginExports } from '@ultimabase/core/plugin'
import { describe, expectTypeOf, it } from 'vitest'

import { password, passwordOperations } from './index.js'

const EmailApp = UltimaBase.use(
	authPlugin({ methods: [password({ identifier: 'email' })] }),
)
const EmailUser = EmailApp.UserSchema.define({
	className: 'TypedEmailUser',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({})

const UsernameApp = UltimaBase.use(authPlugin({ methods: [password()] }))
const UsernameUser = UsernameApp.UserSchema.define({
	className: 'TypedUsernameUser',
}).with({})

describe('App.UserSchema with password()', () => {
	it('adds the identifier field the method selects', () => {
		expectTypeOf<Model<typeof EmailUser>['email']>().toEqualTypeOf<string>()
		expectTypeOf<
			Model<typeof EmailUser>['displayName']
		>().toEqualTypeOf<string>()
		expectTypeOf<
			Model<typeof UsernameUser>['username']
		>().toEqualTypeOf<string>()
		expectTypeOf<Model<typeof UsernameUser>>().not.toHaveProperty('email')
	})

	it('types sign-up from the create fields and results as the User model', () => {
		expectTypeOf(EmailUser.signUp)
			.parameter(0)
			.toEqualTypeOf<
				CreateInput<typeof EmailUser> & { readonly password: string }
			>()
		expectTypeOf<
			Awaited<ReturnType<typeof EmailUser.signUp>>['user']
		>().toEqualTypeOf<Model<typeof EmailUser>>()
		expectTypeOf<
			Awaited<ReturnType<typeof EmailUser.login>>['user']
		>().toEqualTypeOf<Model<typeof EmailUser>>()
		expectTypeOf<Awaited<ReturnType<typeof EmailUser.current>>>().toEqualTypeOf<
			Model<typeof EmailUser>
		>()
		// @ts-expect-error -- `displayName` is required by the User schema.
		void EmailUser.signUp({ email: 'ada@example.test', password: 'secret' })
	})

	it('logs in with the configured identifier only', () => {
		expectTypeOf(EmailUser.login).parameter(0).toEqualTypeOf<{
			readonly email: string
			readonly password: string
		}>()
		// @ts-expect-error -- The email method has no username.
		void EmailUser.login({ password: 'secret', username: 'ada' })
		void UsernameUser.login({ password: 'secret', username: 'ada' })
	})

	it('adds the foundation members and plugin exports', () => {
		expectTypeOf(EmailUser.listSessions).returns.resolves.toHaveProperty(
			'sessions',
		)
		expectTypeOf(EmailUser.deleteAccount).returns.resolves.toEqualTypeOf<{
			readonly deleted: true
		}>()
		expectTypeOf<
			PluginExports<ReturnType<typeof authPlugin>>
		>().toEqualTypeOf<AuthPluginExports>()
		const ultimabase = new EmailApp({ schemas: [EmailUser] })
		expectTypeOf(
			ultimabase.operation(passwordOperations.login).execute,
		).returns.resolves.toEqualTypeOf<AuthenticationResult>()
	})

	it('adds no factory without authPlugin', () => {
		// @ts-expect-error -- `UserSchema` comes from authPlugin.
		void UltimaBase.use().UserSchema
	})
})
