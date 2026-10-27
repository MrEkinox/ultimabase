// Email verification (D-117): the field Master alone writes, the email
// sign-up sends, `verifyEmail` and `sendVerificationEmail`.
import type { Adapter } from 'ultimabase'
import { memory } from 'ultimabase'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { Email, PasswordOptions } from './index.ts'
import {
	bearer,
	graphqlOf,
	M,
	signInQuery,
	signUpQuery,
	started,
	tokenOf,
	User,
} from './test/app.ts'
import { issueToken, PasswordToken } from './tokens.ts'

const outbox: Email[] = []
const sendEmail = async (email: Email) => {
	outbox.push(email)
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	await stop?.()
	stop = undefined
	outbox.length = 0
})

async function server(
	options: PasswordOptions = { sendEmail },
	database: Adapter = memory(),
) {
	const running = await started({ signUp: ['name'], ...options }, database)
	stop = async () => running.app.stop()
	return running
}

const ada = { email: 'ada@example.com', password: 'correct horse' }
const verifyQuery = `mutation ($input: VerifyEmailInput!) { verifyEmail(input: $input) }`
const sendQuery = 'mutation { sendVerificationEmail }'

const signUp = async (url: string, email = ada.email) =>
	graphqlOf(url, signUpQuery, { input: { ...ada, email, name: 'Ada' } })
const verify = async (url: string, token: string) =>
	graphqlOf(url, verifyQuery, { input: { token } })
const send = async (url: string, session: string) =>
	graphqlOf(url, sendQuery, {}, bearer(session))
const verified = async () =>
	(await User.findFirst({ where: { name: 'Ada' } }, M))?.emailVerified

const sent = async (count: number) =>
	vi.waitFor(() => {
		expect(outbox).toHaveLength(count)
	})
const tokenAt = (index: number) => outbox[index]?.token ?? ''
const invalidLink = {
	errors: [
		{
			message: 'This link is invalid or has expired.',
			extensions: { code: 'INVALID_CREDENTIALS' },
		},
	],
}

/** Ada signed up by the command, which sends nothing, and her session. */
async function signedInAda(url: string) {
	const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
	const session = tokenOf(
		(await graphqlOf(url, signInQuery, { input: ada })).body,
		'signIn',
	)
	return { user, session }
}

describe('emailVerified', () => {
	it('is false, even without sendEmail, and only Master writes it', async () => {
		await server({})
		const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
		expect(user.emailVerified).toBe(false)
		expectTypeOf(user.emailVerified).toEqualTypeOf<boolean>()
		const asAda = { as: { kind: 'user', user } } as const
		const where = { id: user.id }
		await expect(
			User.update({ where, data: { emailVerified: true } }, asAda),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		await expect(
			User.create({ data: { name: 'Grace', emailVerified: true } }, asAda),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		await User.update({ where, data: { emailVerified: true } }, M)
		expect(await verified()).toBe(true)
	})

	it('is not data a sign-up takes', async () => {
		const { url } = await server()
		const { body } = await graphqlOf(url, signUpQuery, {
			input: { ...ada, name: 'Ada', emailVerified: true },
		})
		expect(JSON.stringify(body)).toContain('emailVerified')
		expect(await User.count({}, M)).toBe(0)
		await expect(
			User.signUp({ ...ada, data: { name: 'Ada', emailVerified: true } }),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})
})

describe('signing up', () => {
	it('sends the verification email once the user exists', async () => {
		const { url } = await server()
		const { body } = await signUp(url, ' ADA@example.com ')
		await sent(1)
		const user = await User.findFirst({}, M)
		expect(outbox).toEqual([
			{
				kind: 'verify',
				to: 'ada@example.com',
				token: tokenAt(0),
				userId: user?.id,
			},
		])
		expect(tokenOf(body, 'signUp')).not.toBe('undefined')
		expect(await verified()).toBe(false)
	})

	it('signs up when the email fails to send, and logs it', async () => {
		const { url, app, errors } = await server({
			sendEmail: async () => {
				throw new Error('The mail service is down.')
			},
		})
		expect(JSON.stringify((await signUp(url)).body)).toContain('"token"')
		await app.stop()
		expect(errors).toEqual(['An email failed to send.'])
	})

	it('sends nothing by the command, nor without sendEmail', async () => {
		const { app } = await server()
		await User.signUp({ ...ada, data: { name: 'Ada' } })
		await app.stop()
		expect(outbox).toEqual([])
		const plain = await server({})
		await signUp(plain.url, 'grace@example.com')
		await plain.app.stop()
		expect(outbox).toEqual([])
	})
})

describe('verifying an email', () => {
	it('marks the email verified, once per token', async () => {
		const { url } = await server()
		await signUp(url)
		await sent(1)
		expect((await verify(url, tokenAt(0))).body).toEqual({
			data: { verifyEmail: true },
		})
		expect(await verified()).toBe(true)
		expect((await verify(url, tokenAt(0))).body).toMatchObject(invalidLink)
	})

	it('refuses a reset token and an expired one', async () => {
		const { url } = await server()
		const { user } = await signedInAda(url)
		const reset = await issueToken(user.id, 'reset')
		expect((await verify(url, reset)).body).toMatchObject(invalidLink)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		const late = await issueToken(user.id, 'verify')
		vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000)
		expect((await verify(url, late)).body).toMatchObject(invalidLink)
		vi.spyOn(Date, 'now').mockReturnValue(now)
		const inTime = await issueToken(user.id, 'verify')
		vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000 - 1)
		expect((await verify(url, inTime)).body).toEqual({
			data: { verifyEmail: true },
		})
		expect(await verified()).toBe(true)
	})

	it('is absent without sendEmail', async () => {
		const { url } = await server({})
		for (const query of [verifyQuery, sendQuery]) {
			const { body } = await graphqlOf(url, query, { input: { token: 't' } })
			expect(JSON.stringify(body)).toContain('Cannot query field')
		}
	})

	it('is what a reset does too', async () => {
		const { url } = await server()
		const { user } = await signedInAda(url)
		const token = await issueToken(user.id, 'reset')
		await graphqlOf(
			url,
			'mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }',
			{ input: { token, password: 'new secret!' } },
		)
		expect(await verified()).toBe(true)
	})
})

describe('sending the verification email again', () => {
	it('needs a signed-in user', async () => {
		const { url } = await server()
		expect((await graphqlOf(url, sendQuery)).body).toMatchObject({
			errors: [
				{
					message: 'sendVerificationEmail needs a signed-in user.',
					extensions: { code: 'UNAUTHENTICATED' },
				},
			],
		})
	})

	it('sends a new link, which replaces the older one', async () => {
		const { url } = await server()
		const { user, session } = await signedInAda(url)
		const older = await issueToken(user.id, 'verify')
		expect((await send(url, session)).body).toEqual({
			data: { sendVerificationEmail: true },
		})
		expect(outbox).toEqual([
			{ kind: 'verify', to: ada.email, token: tokenAt(0), userId: user.id },
		])
		expect(await PasswordToken.count({}, M)).toBe(1)
		expect((await verify(url, older)).body).toMatchObject(invalidLink)
		expect((await verify(url, tokenAt(0))).body).toEqual({
			data: { verifyEmail: true },
		})
	})

	it('sends nothing once verified, nor to a user without a password', async () => {
		const database = memory()
		const { url } = await server({ sendEmail }, database)
		const { user, session } = await signedInAda(url)
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: true } },
			M,
		)
		expect((await send(url, session)).body).toEqual({
			data: { sendVerificationEmail: true },
		})
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: false } },
			M,
		)
		// As a user who signed in another way: no password account.
		const read = database.find.bind(database)
		vi.spyOn(database, 'find').mockImplementation(async (query) =>
			query.model === 'AuthAccount' ? [] : read(query),
		)
		expect((await send(url, session)).body).toEqual({
			data: { sendVerificationEmail: true },
		})
		expect(outbox).toEqual([])
	})

	it('fails past three emails to the account within one hour', async () => {
		const { url } = await server()
		const { session } = await signedInAda(url)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		for (let index = 0; index < 3; index += 1) await send(url, session)
		vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 1000)
		expect((await send(url, session)).body).toMatchObject({
			errors: [
				{
					extensions: {
						code: 'TOO_MANY_ATTEMPTS',
						details: { retryAfter: 3590 },
					},
				},
			],
		})
		expect(outbox).toHaveLength(3)
	})

	it('refuses the eleventh request from one address within one hour', async () => {
		const { url } = await server()
		const { user, session } = await signedInAda(url)
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: true } },
			M,
		)
		for (let index = 0; index < 10; index += 1) await send(url, session)
		expect(JSON.stringify((await send(url, session)).body)).toContain(
			'TOO_MANY_ATTEMPTS',
		)
		// Resets are counted apart.
		const { body } = await graphqlOf(
			url,
			'mutation ($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }',
			{ input: { email: ada.email } },
		)
		expect(body).toEqual({ data: { requestPasswordReset: true } })
	})
})
