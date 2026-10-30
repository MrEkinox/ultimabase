// `User.closeAccount` (D-160): the row stays, the password, the links and
// the email go, so the email signs up again.
import type { Adapter } from 'ultimabase'
import { memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Email } from './index.ts'
import { PasswordHash, PasswordRequest } from './models.ts'
import {
	graphqlOf,
	M,
	signInQuery,
	signUpQuery,
	started,
	User,
} from './test/app.ts'
import { PasswordToken } from './tokens.ts'

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

async function server(database: Adapter = memory()) {
	const running = await started({ signUp: ['name'], sendEmail }, database)
	stop = async () => running.app.stop()
	const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
	return { ...running, user }
}

const ada = { email: 'ada@example.com', password: 'correct horse' }
const requestQuery = `mutation ($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }`
const resetQuery = `mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }`

const signIn = async (url: string) =>
	graphqlOf(url, signInQuery, { input: ada })
const request = async (url: string) =>
	graphqlOf(url, requestQuery, { input: { email: ada.email } })
const sent = async (count: number) =>
	vi.waitFor(() => {
		expect(outbox).toHaveLength(count)
	})
const wrong = {
	errors: [{ extensions: { code: 'INVALID_CREDENTIALS' } }],
}

/** A database that closes the account once the sign-in read its hash. */
function closingOnRead(): Adapter & { arm(userId: string): void } {
	const database = memory()
	let armed: string | undefined
	return {
		start: async (schema, logger) => database.start(schema, logger),
		stop: async () => database.stop(),
		begin: async () => database.begin(),
		find: async (read) => {
			const rows = await database.find(read)
			if (read.model === 'PasswordHash' && armed !== undefined) {
				const id = armed
				armed = undefined
				await User.closeAccount({ id }, M)
			}
			return rows
		},
		count: async (read) => database.count(read),
		aggregate: async (read) => database.aggregate(read),
		write: async (write) => database.write(write),
		arm: (userId) => {
			armed = userId
		},
	}
}

describe('a closed account', () => {
	it('keeps its row, without a password or a verified email', async () => {
		const { url, user } = await server()
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: true } },
			M,
		)
		await request(url)
		await sent(1)
		await User.closeAccount({ id: user.id }, { as: { kind: 'user', user } })
		expect(await User.findUnique({ where: { id: user.id } }, M)).toMatchObject({
			name: 'Ada',
			emailVerified: false,
		})
		expect(await PasswordHash.count({}, M)).toBe(0)
		expect(await PasswordToken.count({}, M)).toBe(0)
		expect(await PasswordRequest.count({ where: { kind: 'email' } }, M)).toBe(0)
		// Closed already: nothing to close.
		await User.closeAccount({ id: user.id }, M)
	})

	it('signs in no more, and its reset links fail', async () => {
		const { url, user } = await server()
		await request(url)
		await sent(1)
		const token = outbox[0]?.token ?? ''
		await User.closeAccount({ id: user.id }, M)
		expect((await signIn(url)).body).toMatchObject(wrong)
		const reset = { token, password: 'new secret!' }
		expect(
			(await graphqlOf(url, resetQuery, { input: reset })).body,
		).toMatchObject(wrong)
		// The email belongs to no one: a reset sends nothing.
		await request(url)
		await stop?.()
		stop = undefined
		expect(outbox).toHaveLength(1)
	})

	it('frees its email for a new user', async () => {
		const { url, user } = await server()
		await User.closeAccount({ id: user.id }, M)
		const input = { ...ada, name: 'Ada again' }
		const { body } = await graphqlOf(url, signUpQuery, { input })
		expect(body).toMatchObject({
			data: { signUp: { user: { name: 'Ada again' } } },
		})
		expect(await User.count({}, M)).toBe(2)
		expect((await signIn(url)).body).toMatchObject({
			data: { signIn: { user: { name: 'Ada again' } } },
		})
	})

	it('fails a sign-in that checked the password before', async () => {
		const database = closingOnRead()
		const { url, user } = await server(database)
		database.arm(user.id)
		expect((await signIn(url)).body).toMatchObject(wrong)
		// The close ran between the check and the session.
		expect(await PasswordHash.count({}, M)).toBe(0)
	})
})
