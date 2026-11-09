// The password functions a client calls: reset and verification emails, a
// password or email change, and the limit on failed sign-ins. Each request
// file a page shows is sent here and its response compared with its JSON
// file (D-282).
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { emailed, outbox } from './mail.ts'
import { User } from './user.ts'

const { file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)
const as = { as: master }
const aString: unknown = expect.any(String)
const aNumber: unknown = expect.any(Number)
const credentials = { email: 'ada@example.com', password: 'correct horse' }

const registerAda = () =>
	User.signUp({ ...credentials, data: { name: 'Ada' } }, as)

/** The headers of the session a sign-up opens, as a request file sends them. */
async function session() {
	const input = { ...credentials, name: 'Ada' }
	const body = z
		.object({ data: z.object({ signUp: z.object({ token: z.string() }) }) })
		.parse(await file('sign-up', { input }))
	return { headers: { authorization: `Bearer ${body.data.signUp.token}` } }
}

it('refuses a new password that is the email', async () => {
	//#region new-password
	const signUp = { email: 'ada@example.com', data: { name: 'Ada' } }
	await expect(
		User.signUp({ ...signUp, password: 'Ada@Example.com' }, as),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'password: A password cannot be the email.',
	})
	//#endregion
})

it('resets a forgotten password from the emailed link', async () => {
	await registerAda()
	// The same answer whether the email has an account.
	await check('request-reset', { input: { email: 'ada@example.com' } })
	// The page the link opens sends its token and the new password.
	const token = await emailed('reset')
	const input = { token, password: 'battery staple' }
	await check('reset-password', { input })
	await check('sign-in', {
		input: { ...credentials, password: 'battery staple' },
	})
	// A link works once.
	expect(await file('reset-password', { input })).toMatchObject({
		errors: [
			{
				message: 'This link is invalid or has expired.',
				extensions: { code: 'INVALID_CREDENTIALS' },
			},
		],
	})
})

it('verifies the email from the link sign-up sends', async () => {
	const bearer = await session()
	// The signUp function sent the verification email.
	const before = await file('verified', {}, bearer)
	expect(before).toEqual({ data: { viewer: { emailVerified: false } } })
	const token = await emailed('verify')
	await check('verify-email', { input: { token } })
	await check('verified', {}, bearer)
})

it('changes the password of the signed-in user', async () => {
	const bearer = await session()
	const input = {
		currentPassword: 'correct horse',
		newPassword: 'battery staple',
	}
	const changed = await file('change-password', { input }, bearer)
	// A new session; every other one, this one's too, has ended.
	// passwordSetAt, which the user alone reads, is now.
	expect(changed).toMatchObject({
		data: {
			changePassword: { token: aString, user: { passwordSetAt: aString } },
		},
	})
	// The old password stops working.
	expect(await file('sign-in', { input: credentials })).toMatchObject({
		errors: [{ message: 'Wrong email or password.' }],
	})
	//#region changed
	// The account is told.
	await vi.waitFor(() => {
		expect(outbox.at(-1)).toMatchObject({
			kind: 'passwordChanged',
			to: 'ada@example.com',
			text: 'Hello Ada, your password was changed. Not you? Reset it.',
		})
	})
	//#endregion
})

it('checks the password again before a sensitive action', async () => {
	const ada = await registerAda()
	//#region check-password
	// As the user; a function's run passes its own caller and client.
	const self = { as: asUser(ada) }
	await User.checkPassword({ id: ada.id, password: 'correct horse' }, self)
	await expect(
		User.checkPassword({ id: ada.id, password: 'wrong password' }, self),
	).rejects.toMatchObject({
		code: 'INVALID_CREDENTIALS',
		message: 'Wrong password.',
	})
	//#endregion
})

it('changes the email once the new address confirms', async () => {
	const bearer = await session()
	// The password again, so a stolen session cannot take the account.
	const request = {
		newEmail: 'ada@new.example',
		currentPassword: 'correct horse',
	}
	await check('request-email-change', { input: request }, bearer)
	// The link goes to the new address; its page sends the token back.
	const token = await emailed('emailChange')
	await check('confirm-email-change', { input: { token } })
	//#region email-changed
	// The email is verified, and the old address is told.
	expect(
		await User.signIn({ email: 'ada@new.example', password: 'correct horse' }),
	).toMatchObject({ user: { email: 'ada@new.example', emailVerified: true } })
	await vi.waitFor(() => {
		expect(outbox.at(-1)).toMatchObject({
			kind: 'emailChanged',
			to: 'ada@example.com',
		})
	})
	//#endregion
})

it('changes the email from server code', async () => {
	const ada = await registerAda()
	//#region email-update
	// As Master, without any email: the account follows the field.
	const updated = await User.update(
		{ where: { id: ada.id }, data: { email: 'Ada@New.Example' } },
		as,
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
	const ada = await registerAda()
	//#region server-reset
	// Commands that name a user run as Master or as that user.
	await User.sendVerificationEmail({ id: ada.id }, as)
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
	await registerAda()
	const wrong = { ...credentials, password: 'wrong horse' }
	for (let failed = 0; failed < 10; failed += 1) {
		expect(await file('sign-in', { input: wrong })).toMatchObject({
			errors: [{ extensions: { code: 'INVALID_CREDENTIALS' } }],
		})
	}
	// Refused before the password is checked, even the right one.
	expect(await file('sign-in', { input: credentials })).toMatchObject({
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
})
