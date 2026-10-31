// The stored email and its change (D-162): the field the password account's
// subject fills, the hooks that keep both in step on Master's writes, and
// `requestEmailChange` with `confirmEmailChange`.
import { authPlugin, defineUser } from '@ultimabase/auth'
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Caller } from 'ultimabase'
import { allow, defineApp, memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Email, PasswordOptions } from './index.ts'
import { password, passwordPlugin } from './index.ts'
import {
	bearer,
	graphqlOf,
	M,
	signInQuery,
	started,
	tokenIn,
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

const ada = { email: 'ada@example.com', password: 'correct horse' }

async function server(
	options: PasswordOptions = { sendEmail },
	database: Adapter = memory(),
) {
	const running = await started({ signUp: ['name'], ...options }, database)
	stop = async () => running.app.stop()
	const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
	const asAda: Caller = { kind: 'user', user }
	return { ...running, user, asAda }
}

const signIn = async (url: string, email: string) =>
	graphqlOf(url, signInQuery, { input: { ...ada, email } })
const signedIn = (body: unknown) => tokenOf(body, 'signIn') !== 'undefined'
const emailOf = async (id: string) =>
	(await User.findUnique({ where: { id } }, M))?.email
const sent = async (count: number) =>
	vi.waitFor(() => {
		expect(outbox).toHaveLength(count)
	})

const requestQuery = `mutation ($input: RequestEmailChangeInput!) { requestEmailChange(input: $input) }`
const confirmQuery = `mutation ($input: ConfirmEmailChangeInput!) { confirmEmailChange(input: $input) }`
const meQuery = 'query ($id: ID!) { user(where: { id: $id }) { id } }'

const request = async (
	url: string,
	session: string,
	newEmail: string,
	currentPassword = ada.password,
) =>
	graphqlOf(
		url,
		requestQuery,
		{ input: { newEmail, currentPassword } },
		bearer(session),
	)
const confirm = async (url: string, token: string) =>
	graphqlOf(url, confirmQuery, { input: { token } })
const failed = (code: string, message?: string) => ({
	errors: [
		{ ...(message === undefined ? {} : { message }), extensions: { code } },
	],
})

describe('User.email', () => {
	it('holds the account’s email, which the user and Master read', async () => {
		const { user, asAda } = await server()
		expect(user.email).toBe('ada@example.com')
		const own = await User.findUnique({ where: { id: user.id } }, { as: asAda })
		expect(own?.email).toBe('ada@example.com')
		await expect(
			User.update(
				{ where: { id: user.id }, data: { email: 'a@b.co' } },
				{
					as: asAda,
				},
			),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it('is left out for any other caller', async () => {
		const Member = defineUser({
			name: 'Member',
			use: [password()],
			fields: (f) => ({ name: f.string() }),
		}).with({ access: { read: allow.public } })
		const app = defineApp({
			database: memory(),
			plugins: [
				httpPlugin({ port: 0 }),
				authPlugin(),
				passwordPlugin({ signUp: ['name'] }),
			],
			models: [Member],
		})
		await app.start()
		stop = async () => app.stop()
		await Member.signUp({ ...ada, data: { name: 'Ada' } })
		const grace = await Member.signUp({
			...ada,
			email: 'grace@example.com',
			data: { name: 'Grace' },
		})
		const asGrace: Caller = { kind: 'user', user: grace }
		const rows = await Member.findMany(
			{ orderBy: { name: 'asc' } },
			{
				as: asGrace,
			},
		)
		expect(rows.map(({ email }) => email)).toStrictEqual([
			undefined,
			'grace@example.com',
		])
		await expect(
			Member.findMany({ where: { email: 'ada@example.com' } }, { as: asGrace }),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})

	it('moves the account when Master writes it', async () => {
		const { url, user } = await server()
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: true } },
			M,
		)
		const reset = await issueToken(user.id, 'reset', ada.email)
		const updated = await User.update(
			{ where: { id: user.id }, data: { email: ' Ada@New.Example ' } },
			M,
		)
		expect(updated).toMatchObject({
			email: 'ada@new.example',
			emailVerified: false,
		})
		expect(signedIn((await signIn(url, 'ada@new.example')).body)).toBe(true)
		expect(signedIn((await signIn(url, ada.email)).body)).toBe(false)
		expect(reset).not.toBe('')
		await expect(
			PasswordToken.count({ where: { userId: user.id } }, M),
		).resolves.toBe(0)
		// The old email is free again.
		await User.signUp({ ...ada, data: { name: 'Ada again' } })
	})

	it('keeps emailVerified when the write sets it', async () => {
		const { user } = await server()
		const data = { email: 'ada@new.example', emailVerified: true }
		const updated = await User.update({ where: { id: user.id }, data }, M)
		expect(updated.emailVerified).toBe(true)
	})

	it('refuses an invalid or a taken email, and writes nothing', async () => {
		const { url, user } = await server()
		const grace = await User.signUp({
			...ada,
			email: 'grace@example.com',
			data: { name: 'Grace' },
		})
		await expect(
			User.update({ where: { id: user.id }, data: { email: 'nope' } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await expect(
			User.update(
				{ where: { id: user.id }, data: { email: 'Grace@Example.com' } },
				M,
			),
		).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
		await expect(emailOf(user.id)).resolves.toBe(ada.email)
		await expect(emailOf(grace.id)).resolves.toBe('grace@example.com')
		expect(signedIn((await signIn(url, ada.email)).body)).toBe(true)
	})

	it('refuses null while the account is linked', async () => {
		const { user } = await server()
		await expect(
			User.update({ where: { id: user.id }, data: { email: null } }, M),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			message: 'email: closeAccount removes the email.',
		})
		await User.closeAccount({ id: user.id }, M)
		await expect(emailOf(user.id)).resolves.toBeNull()
		const bare = await User.create({ data: { name: 'Bare' } }, M)
		await User.update({ where: { id: bare.id }, data: { email: null } }, M)
	})

	it('fills from the account without unverifying it', async () => {
		const database = memory()
		const { url, user } = await server({ sendEmail }, database)
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: true } },
			M,
		)
		// A user stored before the field: its account, and no email.
		await database.write({
			changes: [
				{ kind: 'update', model: 'User', where: {}, set: { email: null } },
			],
		})
		const filled = await User.update(
			{ where: { id: user.id }, data: { email: ada.email } },
			M,
		)
		expect(filled).toMatchObject({ email: ada.email, emailVerified: true })
		expect(signedIn((await signIn(url, ada.email)).body)).toBe(true)
		// From no email, nobody is told.
		await new Promise((resolve) => setImmediate(resolve))
		expect(outbox).toHaveLength(0)
	})

	it('gives a user without a password an account a reset completes', async () => {
		const { url } = await server()
		const bare = await User.create(
			{ data: { name: 'Bare', email: 'bare@example.com' } },
			M,
		)
		expect(signedIn((await signIn(url, 'bare@example.com')).body)).toBe(false)
		const token = await issueToken(bare.id, 'reset', 'bare@example.com')
		const resetQuery = `mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }`
		await graphqlOf(url, resetQuery, {
			input: { token, password: ada.password },
		})
		expect(signedIn((await signIn(url, 'bare@example.com')).body)).toBe(true)
	})

	it('tells the old address once the change commits', async () => {
		const { user } = await server()
		await User.update(
			{ where: { id: user.id }, data: { email: 'ada@new.example' } },
			M,
		)
		await sent(1)
		expect(outbox[0]).toStrictEqual({
			kind: 'emailChanged',
			to: ada.email,
			newEmail: 'ada@new.example',
			userId: user.id,
		})
	})

	it('changes without sendEmail, telling nobody', async () => {
		const { user } = await server({})
		await User.update(
			{ where: { id: user.id }, data: { email: 'ada@new.example' } },
			M,
		)
		await expect(emailOf(user.id)).resolves.toBe('ada@new.example')
	})

	it('stops a user model with its own email', () => {
		expect(() =>
			defineUser({
				name: 'User',
				use: [password()],
				fields: (f) => ({ email: f.string() }),
			}),
		).toThrow('User.email: password adds a field User already has.')
	})
})

async function signedInAda() {
	const running = await server()
	const session = tokenOf((await signIn(running.url, ada.email)).body, 'signIn')
	return { ...running, session }
}

describe('requestEmailChange and confirmEmailChange', () => {
	it('change the email once the new address confirms', async () => {
		const { url, user, session } = await signedInAda()
		const asked = await request(url, session, 'Ada@New.Example')
		expect(asked.body).toStrictEqual({ data: { requestEmailChange: true } })
		expect(outbox).toMatchObject([
			{ kind: 'emailChange', to: 'ada@new.example', userId: user.id },
		])
		await expect(emailOf(user.id)).resolves.toBe(ada.email)
		const confirmed = await confirm(url, tokenIn(outbox[0]))
		expect(confirmed.body).toStrictEqual({ data: { confirmEmailChange: true } })
		const changed = await User.findUnique({ where: { id: user.id } }, M)
		expect(changed).toMatchObject({
			email: 'ada@new.example',
			emailVerified: true,
		})
		await sent(2)
		expect(outbox[1]).toMatchObject({ kind: 'emailChanged', to: ada.email })
		// The session still works: the password did not change.
		const me = await graphqlOf(url, meQuery, { id: user.id }, bearer(session))
		expect(me.body).toStrictEqual({ data: { user: { id: user.id } } })
		expect(signedIn((await signIn(url, 'ada@new.example')).body)).toBe(true)
		expect((await confirm(url, tokenIn(outbox[0]))).body).toMatchObject(
			failed('INVALID_CREDENTIALS', 'This link is invalid or has expired.'),
		)
	})

	it('need a signed-in user and the current password', async () => {
		const { url, session } = await signedInAda()
		const anonymous = await graphqlOf(url, requestQuery, {
			input: { newEmail: 'ada@new.example', currentPassword: ada.password },
		})
		expect(anonymous.body).toMatchObject(
			failed('UNAUTHENTICATED', 'This function needs a signed-in user.'),
		)
		const wrong = await request(url, session, 'ada@new.example', 'wrong one')
		expect(wrong.body).toMatchObject(
			failed('INVALID_CREDENTIALS', 'Wrong password.'),
		)
		expect(outbox).toHaveLength(0)
	})

	it('refuse an email that has an account, the user’s own included', async () => {
		const { url, session } = await signedInAda()
		await User.signUp({
			...ada,
			email: 'grace@example.com',
			data: { name: 'Grace' },
		})
		for (const taken of ['grace@example.com', ada.email]) {
			expect((await request(url, session, taken)).body).toMatchObject(
				failed('UNIQUE_VIOLATION', 'This email has an account.'),
			)
		}
		expect(outbox).toHaveLength(0)
	})

	it('keep the link of an email taken meanwhile until it expires', async () => {
		const { url, user, session } = await signedInAda()
		await request(url, session, 'ada@new.example')
		const token = tokenIn(outbox[0])
		const grace = await User.signUp({
			...ada,
			email: 'ada@new.example',
			data: { name: 'Grace' },
		})
		expect((await confirm(url, token)).body).toMatchObject(
			failed('UNIQUE_VIOLATION'),
		)
		await expect(emailOf(user.id)).resolves.toBe(ada.email)
		await User.update(
			{ where: { id: grace.id }, data: { email: 'grace@example.com' } },
			M,
		)
		expect((await confirm(url, token)).body).toStrictEqual({
			data: { confirmEmailChange: true },
		})
		await expect(emailOf(user.id)).resolves.toBe('ada@new.example')
	})

	it('keep one link per user, valid one hour', async () => {
		const { url, session } = await signedInAda()
		await request(url, session, 'ada@new.example')
		await request(url, session, 'ada@other.example')
		const expired = failed(
			'INVALID_CREDENTIALS',
			'This link is invalid or has expired.',
		)
		expect((await confirm(url, tokenIn(outbox[0]))).body).toMatchObject(expired)
		const later = Date.now() + 60 * 60 * 1000
		vi.spyOn(Date, 'now').mockReturnValue(later)
		expect((await confirm(url, tokenIn(outbox[1]))).body).toMatchObject(expired)
	})

	it('count the email in the account’s three per hour', async () => {
		const { url, session } = await signedInAda()
		for (const n of [1, 2, 3]) {
			await request(url, session, `ada${String(n)}@new.example`)
		}
		expect(
			(await request(url, session, 'ada4@new.example')).body,
		).toMatchObject(failed('TOO_MANY_ATTEMPTS'))
		expect(outbox).toHaveLength(3)
	})
})
