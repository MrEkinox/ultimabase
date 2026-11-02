// The password functions a client calls: reset and verification emails, a
// password or email change, and the limit on failed sign-ins.
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { app } from './app.ts'
import { outbox } from './mail.ts'
import { User } from './models.ts'

const running = testApplication(app)
const aString: unknown = expect.any(String)
const aNumber: unknown = expect.any(Number)

/** A GraphQL request's response body. */
async function request(
	query: string,
	input?: object,
	headers: Record<string, string> = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables: { input } }),
	})
	return response.json()
}

const signIn = (password: string) =>
	request(
		`mutation ($input: SignInInput!) { signIn(input: $input) { user { name } } }`,
		{ email: 'ada@example.com', password },
	)

/** The token of the latest email of `kind` to Ada, once it is sent. */
async function emailed(
	kind: 'reset' | 'verify' | 'emailChange',
): Promise<string> {
	return vi.waitFor(() => {
		const found = outbox.findLast((email) => email.kind === kind)
		if (found === undefined || !('token' in found)) {
			throw new Error(`No ${kind} email yet.`)
		}
		return found.token
	})
}

const signUp = () =>
	User.signUp(
		{
			email: 'ada@example.com',
			password: 'correct horse',
			data: { name: 'Ada' },
		},
		{ as: master },
	)

it('refuses a new password that is the email', async () => {
	//#region new-password
	await expect(
		User.signUp(
			{
				email: 'ada@example.com',
				password: 'Ada@Example.com',
				data: { name: 'Ada' },
			},
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'password: A password cannot be the email.',
	})
	//#endregion
})

it('resets a forgotten password from the emailed link', async () => {
	await signUp()
	//#region reset
	// The same answer whether the email has an account.
	expect(
		await request(
			`mutation ($input: RequestPasswordResetInput!) {
				requestPasswordReset(input: $input)
			}`,
			{ email: 'ada@example.com' },
		),
	).toEqual({ data: { requestPasswordReset: true } })

	// The page the link opens sends its token and the new password.
	const token = await emailed('reset')
	const reset = `mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }`
	expect(await request(reset, { token, password: 'battery staple' })).toEqual({
		data: { resetPassword: true },
	})
	expect(await signIn('battery staple')).toEqual({
		data: { signIn: { user: { name: 'Ada' } } },
	})
	// A link works once.
	expect(
		await request(reset, { token, password: 'another one' }),
	).toMatchObject({
		errors: [
			{
				message: 'This link is invalid or has expired.',
				extensions: { code: 'INVALID_CREDENTIALS' },
			},
		],
	})
	//#endregion
})

it('verifies the email from the link sign-up sends', async () => {
	//#region verify
	// The signUp function sends the verification email.
	const signedUp = await request(
		`mutation ($input: SignUpInput!) { signUp(input: $input) { token } }`,
		{ email: 'ada@example.com', password: 'correct horse', name: 'Ada' },
	)
	const session = z
		.object({ data: z.object({ signUp: z.object({ token: z.string() }) }) })
		.parse(signedUp).data.signUp.token
	const bearer = { authorization: `Bearer ${session}` }
	const verified = () =>
		request('{ viewer { emailVerified } }', undefined, bearer)
	expect(await verified()).toEqual({
		data: { viewer: { emailVerified: false } },
	})

	const token = await emailed('verify')
	await request(
		`mutation ($input: VerifyEmailInput!) { verifyEmail(input: $input) }`,
		{ token },
	)
	expect(await verified()).toEqual({
		data: { viewer: { emailVerified: true } },
	})
	//#endregion
})

it('changes the password of the signed-in user', async () => {
	await signUp()
	const { token } = await User.signIn({
		email: 'ada@example.com',
		password: 'correct horse',
	})
	//#region change
	const changed = await request(
		`mutation ($input: ChangePasswordInput!) {
			changePassword(input: $input) { token user { passwordSetAt } }
		}`,
		{ currentPassword: 'correct horse', newPassword: 'battery staple' },
		{ authorization: `Bearer ${token}` },
	)
	// A new session; every other one, this old token's too, has ended.
	// passwordSetAt, which the user alone reads, is now.
	expect(changed).toMatchObject({
		data: {
			changePassword: { token: aString, user: { passwordSetAt: aString } },
		},
	})
	expect(await signIn('correct horse')).toMatchObject({
		errors: [{ message: 'Wrong email or password.' }],
	})
	// The account is told.
	await vi.waitFor(() => {
		expect(outbox.at(-1)).toMatchObject({
			kind: 'passwordChanged',
			to: 'ada@example.com',
		})
	})
	//#endregion
})

it('checks the password again before a sensitive action', async () => {
	const ada = await signUp()
	//#region check
	// As the user; a function's run passes its own caller and client.
	const as = asUser(ada)
	await User.checkPassword({ id: ada.id, password: 'correct horse' }, { as })
	await expect(
		User.checkPassword({ id: ada.id, password: 'wrong password' }, { as }),
	).rejects.toMatchObject({
		code: 'INVALID_CREDENTIALS',
		message: 'Wrong password.',
	})
	//#endregion
})

it('changes the email once the new address confirms', async () => {
	await signUp()
	const { token: session } = await User.signIn({
		email: 'ada@example.com',
		password: 'correct horse',
	})
	//#region email-change
	// The password again, so a stolen session cannot take the account.
	await request(
		`mutation ($input: RequestEmailChangeInput!) {
			requestEmailChange(input: $input)
		}`,
		{ newEmail: 'ada@new.example', currentPassword: 'correct horse' },
		{ authorization: `Bearer ${session}` },
	)
	// The link goes to the new address; its page sends the token back.
	const token = await emailed('emailChange')
	expect(
		await request(
			`mutation ($input: ConfirmEmailChangeInput!) {
				confirmEmailChange(input: $input)
			}`,
			{ token },
		),
	).toEqual({ data: { confirmEmailChange: true } })
	expect(
		await User.signIn({ email: 'ada@new.example', password: 'correct horse' }),
	).toMatchObject({ user: { email: 'ada@new.example', emailVerified: true } })
	// The old address is told.
	await vi.waitFor(() => {
		expect(outbox.at(-1)).toMatchObject({
			kind: 'emailChanged',
			to: 'ada@example.com',
		})
	})
	//#endregion
})

it('changes the email from server code', async () => {
	const ada = await signUp()
	//#region email-update
	// As Master, without any email: the account follows the field.
	const updated = await User.update(
		{ where: { id: ada.id }, data: { email: 'Ada@New.Example' } },
		{ as: master },
	)
	expect(updated).toMatchObject({
		email: 'ada@new.example',
		emailVerified: false,
	})
	await expect(
		User.signIn({ email: 'ada@new.example', password: 'correct horse' }),
	).resolves.toMatchObject({ user: { name: 'Ada' } })
	//#endregion
})

it('verifies and resets from server code', async () => {
	const ada = await signUp()
	//#region server-reset
	// Commands that name a user run as Master or as that user.
	await User.sendVerificationEmail({ id: ada.id }, { as: master })
	await User.verifyEmail({ token: await emailed('verify') })
	// The email has left once the command resolves.
	await User.requestPasswordReset({ email: 'ada@example.com' })
	const token = await emailed('reset')
	await User.resetPassword({ token, password: 'new secret!' })
	await expect(
		User.signIn({ email: 'ada@example.com', password: 'new secret!' }),
	).resolves.toMatchObject({ user: { name: 'Ada', emailVerified: true } })
	//#endregion
})

it('refuses the eleventh failed sign-in within 15 minutes', async () => {
	await signUp()
	//#region limit
	for (let failed = 0; failed < 10; failed += 1) {
		expect(await signIn('wrong horse')).toMatchObject({
			errors: [{ extensions: { code: 'INVALID_CREDENTIALS' } }],
		})
	}
	// Refused before the password is checked, even the right one.
	expect(await signIn('correct horse')).toMatchObject({
		errors: [
			{
				message: 'Too many attempts: try again later.',
				extensions: {
					code: 'TOO_MANY_ATTEMPTS',
					details: { retryAfter: aNumber },
				},
			},
		],
	})
	//#endregion
})
