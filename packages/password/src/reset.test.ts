// Password reset (D-117): the email, the same answer for any email, the
// tokens, the limits and the sends under way.
import { createHash } from 'node:crypto'
import type { Adapter } from 'ultimabase'
import { memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Email, PasswordOptions } from './index.ts'
import { PasswordRequest } from './models.ts'
import {
	bearer,
	graphqlOf,
	M,
	signInQuery,
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
	const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
	return { ...running, user }
}

const ada = { email: 'ada@example.com', password: 'correct horse' }
const requestQuery = `mutation ($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }`
const resetQuery = `mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }`

const request = async (url: string, email = ada.email) =>
	graphqlOf(url, requestQuery, { input: { email } })
const reset = async (url: string, token: string, password = 'new secret!') =>
	graphqlOf(url, resetQuery, { input: { token, password } })
const signIn = async (url: string, password: string) =>
	graphqlOf(url, signInQuery, { input: { ...ada, password } })

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
const tooMany = (retryAfter: number) => ({
	errors: [
		{ extensions: { code: 'TOO_MANY_ATTEMPTS', details: { retryAfter } } },
	],
})

describe('requesting a reset', () => {
	it('sends the account a link with a token whose hash alone is stored', async () => {
		const { url, user } = await server()
		const { body } = await request(url, ' ADA@example.com ')
		expect(body).toEqual({ data: { requestPasswordReset: true } })
		await sent(1)
		const [email] = outbox
		expect(email).toEqual({
			kind: 'reset',
			to: 'ada@example.com',
			token: tokenAt(0),
			userId: user.id,
		})
		expect(tokenAt(0)).toMatch(/^[\w-]{43}$/)
		const [stored] = await PasswordToken.findMany({}, M)
		const hash = createHash('sha256').update(tokenAt(0)).digest('base64url')
		expect(stored).toMatchObject({ userId: user.id, kind: 'reset', hash })
	})

	it('answers an unknown email alike, and sends it nothing', async () => {
		const { url, app, errors } = await server()
		const { body } = await request(url, 'grace@example.com')
		expect(body).toEqual({ data: { requestPasswordReset: true } })
		await app.stop()
		expect(outbox).toEqual([])
		expect(errors).toEqual([])
	})

	it('answers before the email is sent, and stopping waits for it', async () => {
		const { promise: held, resolve: release } = Promise.withResolvers<void>()
		const { url, app } = await server({
			sendEmail: async (email) => {
				await held
				outbox.push(email)
			},
		})
		expect((await request(url)).body).toEqual({
			data: { requestPasswordReset: true },
		})
		let stopped = false
		const stopping = (async () => {
			await app.stop()
			stopped = true
		})()
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(stopped).toBe(false)
		release()
		await stopping
		expect(outbox).toHaveLength(1)
	})

	it('logs a failed send, and answers alike', async () => {
		const { url, app, errors } = await server({
			sendEmail: async () => {
				throw new Error('The mail service is down.')
			},
		})
		expect((await request(url)).body).toEqual({
			data: { requestPasswordReset: true },
		})
		await app.stop()
		expect(errors).toEqual(['An email failed to send.'])
	})

	it('is absent without sendEmail', async () => {
		const { url } = await server({})
		const { body } = await request(url)
		expect(JSON.stringify(body)).toContain(
			'Cannot query field \\"requestPasswordReset\\"',
		)
		expect(JSON.stringify((await reset(url, 'token')).body)).toContain(
			'Cannot query field \\"resetPassword\\"',
		)
	})
})

describe('resetting a password', () => {
	it('sets the password, ends every session and opens none', async () => {
		const { url } = await server()
		const session = tokenOf((await signIn(url, ada.password)).body, 'signIn')
		await request(url)
		await sent(1)
		const { body, setCookie } = await reset(url, tokenAt(0))
		expect(body).toEqual({ data: { resetPassword: true } })
		expect(setCookie).toEqual([])
		const viewer = await graphqlOf(
			url,
			'{ viewer { id } }',
			{},
			bearer(session),
		)
		expect(viewer.body).toMatchObject({ code: 'UNAUTHENTICATED' })
		expect(JSON.stringify((await signIn(url, ada.password)).body)).toContain(
			'INVALID_CREDENTIALS',
		)
		expect(JSON.stringify((await signIn(url, 'new secret!')).body)).toContain(
			'"name":"Ada"',
		)
	})

	it('takes a token once', async () => {
		const { url } = await server()
		await request(url)
		await sent(1)
		expect((await reset(url, tokenAt(0))).body).toEqual({
			data: { resetPassword: true },
		})
		expect((await reset(url, tokenAt(0))).body).toMatchObject(invalidLink)
		expect(await PasswordToken.count({}, M)).toBe(0)
	})

	it('takes a token used twice at once once', async () => {
		const database = memory()
		const { url } = await server({ sendEmail }, database)
		await request(url)
		await sent(1)
		// Both read the token before either deletes it.
		const read = database.find.bind(database)
		const { promise: bothRead, resolve } = Promise.withResolvers<void>()
		let reads = 0
		vi.spyOn(database, 'find').mockImplementation(async (query) => {
			const rows = await read(query)
			if (query.model !== 'PasswordToken') return rows
			reads += 1
			if (reads === 2) resolve()
			await bothRead
			return rows
		})
		const both = await Promise.all([
			reset(url, tokenAt(0)),
			reset(url, tokenAt(0), 'other secret'),
		])
		const passed = both.filter(({ body }) =>
			JSON.stringify(body).includes('"resetPassword":true'),
		)
		expect(passed).toHaveLength(1)
		expect(reads).toBe(2)
	})

	it('refuses a wrong token, a verification token and an expired one', async () => {
		const { url, user } = await server()
		expect((await reset(url, 'wrong')).body).toMatchObject(invalidLink)
		const verify = await issueToken(user.id, 'verify')
		expect((await reset(url, verify)).body).toMatchObject(invalidLink)

		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		await request(url)
		await sent(1)
		vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000)
		expect((await reset(url, tokenAt(0))).body).toMatchObject(invalidLink)
		vi.spyOn(Date, 'now').mockReturnValue(now)
		await request(url)
		await sent(2)
		vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000 - 1)
		expect((await reset(url, tokenAt(1))).body).toEqual({
			data: { resetPassword: true },
		})
	})

	it('checks the new password before taking the token', async () => {
		const { url } = await server()
		await request(url)
		await sent(1)
		const short = await reset(url, tokenAt(0), 'short')
		expect(JSON.stringify(short.body)).toContain('VALIDATION_FAILED')
		expect((await reset(url, tokenAt(0))).body).toEqual({
			data: { resetPassword: true },
		})
	})

	it('takes the newest token only, and none once a password is set', async () => {
		const { url, user } = await server()
		await request(url)
		await request(url)
		await sent(2)
		expect(await PasswordToken.count({}, M)).toBe(1)
		expect((await reset(url, tokenAt(0))).body).toMatchObject(invalidLink)
		await request(url)
		await sent(3)
		await User.setPassword({ id: user.id, password: 'set by Master' }, M)
		expect((await reset(url, tokenAt(2))).body).toMatchObject(invalidLink)
	})

	it('keeps a verification token when a password is set', async () => {
		const { user } = await server()
		await issueToken(user.id, 'verify')
		await User.setPassword({ id: user.id, password: 'set by Master' }, M)
		expect(await PasswordToken.findMany({}, M)).toMatchObject([
			{ kind: 'verify' },
		])
	})

	it('deletes expired tokens when it issues one', async () => {
		const { user } = await server()
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		await issueToken(user.id, 'verify')
		vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000)
		await issueToken(user.id, 'reset')
		expect(await PasswordToken.findMany({}, M)).toMatchObject([
			{ kind: 'reset' },
		])
	})
})

describe('the reset limits', () => {
	it('refuses the eleventh request from one address within one hour', async () => {
		const { url } = await server()
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		for (let index = 0; index < 10; index += 1) {
			await request(url, `user${index}@example.com`)
		}
		vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 1000)
		expect((await request(url)).body).toMatchObject(tooMany(3590))
		// Sign-ups are counted apart.
		const signUp = await graphqlOf(
			url,
			'mutation ($input: SignUpInput!) { signUp(input: $input) { token } }',
			{
				input: {
					email: 'grace@example.com',
					password: 'correct horse',
					name: 'Grace',
				},
			},
		)
		expect(signUp.body).not.toHaveProperty('errors')
		vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000)
		expect((await request(url)).body).toEqual({
			data: { requestPasswordReset: true },
		})
		expect(await PasswordRequest.count({ where: { kind: 'reset' } }, M)).toBe(1)
	})

	it('sends an account three emails within one hour, and answers alike', async () => {
		const { url, app } = await server()
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		for (let index = 0; index < 4; index += 1) {
			expect((await request(url)).body).toEqual({
				data: { requestPasswordReset: true },
			})
		}
		await sent(3)
		expect(await PasswordRequest.count({ where: { kind: 'email' } }, M)).toBe(3)
		vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000)
		await request(url)
		await app.stop()
		expect(outbox).toHaveLength(4)
	})
})

describe('a deleted user', () => {
	it('takes its tokens and its emails along', async () => {
		const { url, user } = await server()
		await request(url)
		await sent(1)
		await User.delete({ where: { id: user.id } }, M)
		expect(await PasswordToken.count({}, M)).toBe(0)
		expect(await PasswordRequest.count({ where: { kind: 'email' } }, M)).toBe(0)
	})
})
