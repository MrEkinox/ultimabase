import { authPlugin, type AuthPendingSignUp } from '@ultimabase/auth-plugin'
import { UltimaBase, type CreateInput, type Model } from '@ultimabase/core'
import { describe, expectTypeOf, it } from 'vitest'

import {
	password,
	passwordEmailOperations,
	type PasswordRequestAcceptedResult,
	type PasswordResetResult,
} from './index.js'

const send = (): Promise<void> => Promise.resolve()

const EmailApp = UltimaBase.use(
	authPlugin({
		methods: [
			password({
				identifier: 'email',
				reset: { sendResetEmail: send },
				verification: {
					requireVerifiedEmail: true,
					sendVerificationEmail: send,
				},
				emailChange: { sendConfirmationEmail: send, sendNoticeEmail: send },
			}),
		],
	}),
)
const EmailUser = EmailApp.UserSchema.define({
	className: 'TypedRecoveryUser',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({})

const UsernameApp = UltimaBase.use(authPlugin({ methods: [password()] }))
const UsernameUser = UsernameApp.UserSchema.define({
	className: 'TypedRecoveryUsernameUser',
}).with({})

describe('password({ identifier: "email" }) email flows', () => {
	it('adds the verification fields as read-only output', () => {
		expectTypeOf<
			Model<typeof EmailUser>['emailVerified']
		>().toEqualTypeOf<boolean>()
		expectTypeOf<Model<typeof EmailUser>['emailVerifiedAt']>().toEqualTypeOf<
			string | null
		>()
		expectTypeOf<CreateInput<typeof EmailUser>>().not.toHaveProperty(
			'emailVerified',
		)
		expectTypeOf<CreateInput<typeof EmailUser>>().not.toHaveProperty(
			'emailVerifiedAt',
		)
		expectTypeOf<Model<typeof UsernameUser>>().not.toHaveProperty(
			'emailVerified',
		)
	})

	it('types sign-up without a session when requireVerifiedEmail is on', () => {
		expectTypeOf<Awaited<ReturnType<typeof EmailUser.signUp>>>().toEqualTypeOf<
			AuthPendingSignUp<typeof EmailUser>
		>()
		const OpenApp = UltimaBase.use(
			authPlugin({
				methods: [
					password({
						identifier: 'email',
						verification: { sendVerificationEmail: send },
					}),
				],
			}),
		)
		const OpenUser = OpenApp.UserSchema.define({
			className: 'TypedOpenRecoveryUser',
		}).with({})
		expectTypeOf(OpenUser).toHaveProperty('signUp')
		expectTypeOf<Awaited<ReturnType<typeof OpenUser.signUp>>>().toHaveProperty(
			'session',
		)
		expectTypeOf<Parameters<typeof OpenUser.signUp>[0]>().toEqualTypeOf<
			CreateInput<typeof OpenUser> & {
				readonly email: string
				readonly password: string
			}
		>()
	})

	it('adds the email statics with their results', () => {
		expectTypeOf(
			EmailUser.requestPasswordReset({ email: 'ada@example.test' }),
		).resolves.toEqualTypeOf<PasswordRequestAcceptedResult>()
		expectTypeOf(
			EmailUser.resetPassword({ newPassword: 'x', token: 't' }),
		).resolves.toEqualTypeOf<PasswordResetResult>()
		expectTypeOf(EmailUser.verifyEmail({ token: 't' })).resolves.toEqualTypeOf<{
			readonly verified: true
		}>()
		expectTypeOf(
			EmailUser.confirmEmailChange({ token: 't' }),
		).resolves.toEqualTypeOf<{ readonly confirmed: true }>()
		// @ts-expect-error -- A username method has no email flows.
		void UsernameUser.requestPasswordReset
	})

	it('types the operations and refuses email options without an email identifier', () => {
		const ultimabase = new EmailApp({ schemas: [EmailUser] })
		expectTypeOf(
			ultimabase
				.operation(passwordEmailOperations.requestEmailChange)
				.execute({ currentPassword: 'x', newEmail: 'y' }),
		).resolves.toEqualTypeOf<PasswordRequestAcceptedResult>()
		// @ts-expect-error -- Reset needs `identifier: 'email'`.
		void password({ reset: { sendResetEmail: send } })
		void password({
			identifier: 'email',
			// @ts-expect-error -- The callback is required in its group.
			reset: {},
		})
	})
})
