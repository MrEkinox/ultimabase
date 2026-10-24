// `passwordPlugin()` (D-113): signing up, in and changing a password over
// GraphQL, the sign-in limit, the hashes, the commands and startup.
import { authPlugin, defineUser } from '@ultimabase/auth'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Caller } from 'ultimabase'
import { defineApp, defineModel, memory } from 'ultimabase'
import { password, passwordPlugin } from './index.ts'
import { hashPassword } from './hash.ts'
import { PasswordAttempt, PasswordHash } from './models.ts'
import {
	bearer,
	changeQuery,
	graphqlOf,
	M,
	signInQuery,
	signUpQuery,
	started,
	tokenOf,
	User,
} from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	await stop?.()
	stop = undefined
})

async function server(...given: Parameters<typeof started>) {
	const running = await started(...given)
	stop = async () => running.app.stop()
	return running
}

const ada = { email: 'ada@example.com', password: 'correct horse' }

async function signUp(url: string, input: Record<string, unknown> = {}) {
	return graphqlOf(url, signUpQuery, {
		input: { ...ada, name: 'Ada', ...input },
	})
}

async function signIn(url: string, input: Record<string, unknown> = {}) {
	return graphqlOf(url, signInQuery, { input: { ...ada, ...input } })
}

const viewerOf = async (url: string, token: string) =>
	graphqlOf(url, '{ viewer { id } }', {}, bearer(token))

/** The first error's extensions. */
function errorOf(body: unknown): unknown {
	const errors: unknown = Reflect.get(Object(body), 'errors')
	return Array.isArray(errors)
		? Reflect.get(Object(errors[0]), 'extensions')
		: undefined
}

const wrong = { code: 'INVALID_CREDENTIALS' }

describe('signing up', () => {
	it('creates the user and its hash, and opens a session with its cookie', async () => {
		const { url } = await server()
		const signed = await signUp(url, { born: '1815-12-10T00:00:00.000Z' })
		expect(signed.status).toBe(200)
		const [user] = await User.findMany({}, M)
		expect(user).toMatchObject({ name: 'Ada', born: new Date('1815-12-10') })
		expect(signed.body).toMatchObject({
			data: { signUp: { user: { id: user?.id, name: 'Ada' } } },
		})
		expect(JSON.stringify(signed.body)).toMatch(
			/"token":"[\w-]{43}","expiresAt":"\d{4}-\d\d-\d\dT[\d:.]+Z"/,
		)
		expect(signed.setCookie[0]).toMatch(/^ultimabase_session=.+; HttpOnly/)
		const token = tokenOf(signed.body, 'signUp')
		const viewer = await viewerOf(url, token)
		expect(viewer.body).toStrictEqual({ data: { viewer: { id: user?.id } } })
		const [stored] = await PasswordHash.findMany({}, M)
		expect(stored?.hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
		expect(stored?.hash).not.toContain(ada.password)
	})

	it('trims and lowercases the email', async () => {
		const { url } = await server()
		await signUp(url, { email: '  Ada@Example.COM ' })
		expect((await signIn(url)).status).toBe(200)
	})

	it('refuses a taken email and creates nothing', async () => {
		const { url } = await server()
		await signUp(url)
		const again = await signUp(url, { email: 'ADA@example.com' })
		expect(errorOf(again.body)).toMatchObject({ code: 'UNIQUE_VIOLATION' })
		expect(await User.count({}, M)).toBe(1)
		expect(await PasswordHash.count({}, M)).toBe(1)
	})

	it('checks the email, the password and the fields', async () => {
		const { url } = await server()
		const refused = await signUp(url, {
			email: 'ada',
			password: 'short',
		})
		expect(errorOf(refused.body)).toStrictEqual({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{ path: ['input', 'email'], message: 'Expected an email address.' },
					{
						path: ['input', 'password'],
						message: 'A password has 8 to 256 characters.',
					},
				],
			},
		})
		const long = await signUp(url, { password: 'é'.repeat(257) })
		expect(errorOf(long.body)).toMatchObject({ code: 'VALIDATION_FAILED' })
		// Code points, not UTF-16 units, are counted.
		expect((await signUp(url, { password: '😀'.repeat(8) })).status).toBe(200)
		expect(await User.count({}, M)).toBe(1)
	})

	it('takes the listed fields only', async () => {
		const { url } = await server()
		const note = await signUp(url, { note: 'admin' })
		expect(JSON.stringify(note.body)).toContain('unknown field \\"note\\"')
		expect(await User.count({}, M)).toBe(0)
	})

	it('is closed with `signUp: false`', async () => {
		const { url } = await server({ signUp: false })
		const closed = await signUp(url)
		expect(JSON.stringify(closed.body)).toContain(
			'Unknown type \\"SignUpInput\\"',
		)
		await expect(
			User.signUp({ ...ada, data: { name: 'Ada' } }),
		).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
			message: 'Sign-up is closed (D-113).',
		})
		await User.signUp({ ...ada, data: { name: 'Ada' } }, M)
		expect((await signIn(url)).status).toBe(200)
	})
})

describe('signing in', () => {
	it('opens a session for the right password, with its cookie', async () => {
		const { url } = await server()
		await signUp(url)
		const signed = await signIn(url, { email: 'ADA@example.com' })
		expect(signed.body).toMatchObject({
			data: { signIn: { user: { name: 'Ada' } } },
		})
		expect(signed.setCookie).toHaveLength(1)
		const viewer = await viewerOf(url, tokenOf(signed.body, 'signIn'))
		expect(viewer.status).toBe(200)
	})

	it('refuses a wrong password and an unknown email alike, with 401', async () => {
		const { url } = await server()
		await signUp(url)
		for (const input of [
			{ password: 'wrong password' },
			{ email: 'bob@example.com' },
		]) {
			const refused = await signIn(url, input)
			expect(errorOf(refused.body)).toStrictEqual(wrong)
			expect(refused.setCookie).toStrictEqual([])
		}
	})

	it('refuses the eleventh failure in 15 minutes, then lets in again', async () => {
		const { url } = await server()
		await signUp(url)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now)
		for (let failure = 0; failure < 10; failure += 1) {
			expect(
				errorOf((await signIn(url, { password: 'wrong password' })).body),
			).toStrictEqual(wrong)
		}
		const limited = await signIn(url)
		expect(errorOf(limited.body)).toStrictEqual({
			code: 'TOO_MANY_ATTEMPTS',
			details: { retryAfter: 900 },
		})
		// Another email from the same address is counted apart.
		expect(
			errorOf((await signIn(url, { email: 'bob@example.com' })).body),
		).toStrictEqual(wrong)
		vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000)
		expect(errorOf((await signIn(url)).body)).toMatchObject({
			details: { retryAfter: 300 },
		})
		vi.spyOn(Date, 'now').mockReturnValue(now + 15 * 60 * 1000)
		expect((await signIn(url)).status).toBe(200)
		expect(errorOf((await signIn(url)).body)).toBeUndefined()
		expect(await PasswordAttempt.count({}, M)).toBe(0)
	})

	it('clears the failures on a success', async () => {
		const { url } = await server()
		await signUp(url)
		for (let failure = 0; failure < 9; failure += 1) {
			await signIn(url, { password: 'wrong password' })
		}
		expect((await signIn(url)).status).toBe(200)
		expect(await PasswordAttempt.count({}, M)).toBe(0)
		await signIn(url, { password: 'wrong password' })
		expect((await signIn(url)).status).toBe(200)
	})

	it('rehashes a hash made with other parameters', async () => {
		const { url } = await server()
		await signUp(url)
		const old = '$argon2id$v=19$m=8192,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdA$'
		const [stored] = await PasswordHash.findMany({}, M)
		const { argon2Sync } = await import('node:crypto')
		const key = argon2Sync('argon2id', {
			message: ada.password,
			nonce: Buffer.from('saltsaltsaltsalt'),
			memory: 8192,
			passes: 1,
			parallelism: 1,
			tagLength: 32,
		})
		const hash = old + key.toString('base64').replace(/=+$/, '')
		await PasswordHash.update(
			{ where: { userId: stored?.userId ?? '' }, data: { hash } },
			M,
		)
		expect((await signIn(url)).status).toBe(200)
		const [rehashed] = await PasswordHash.findMany({}, M)
		expect(rehashed?.hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
		expect((await signIn(url)).status).toBe(200)
	})

	it('stops on a hash that is not Argon2id', async () => {
		const { url } = await server()
		await signUp(url)
		await PasswordHash.update(
			{
				where: { userId: (await User.findMany({}, M))[0]?.id ?? '' },
				data: { hash: 'plain' },
			},
			M,
		)
		const refused = await signIn(url)
		expect(errorOf(refused.body)).toMatchObject({ code: 'INTERNAL' })
	})

	it('is the command User.signIn, uncounted and without a cookie', async () => {
		const { url } = await server()
		await signUp(url)
		for (let failure = 0; failure < 11; failure += 1) {
			await expect(
				User.signIn({ ...ada, password: 'wrong password' }),
			).rejects.toMatchObject(wrong)
		}
		const opened = await User.signIn({ ...ada, email: ' ADA@example.com' })
		expect(opened).toMatchObject({ user: { name: 'Ada' } })
		expect(opened.user).not.toHaveProperty('note')
		expect((await viewerOf(url, opened.token)).status).toBe(200)
		expect(await PasswordAttempt.count({}, M)).toBe(0)
	})
})

async function signedUp() {
	const running = await server()
	const signed = await signUp(running.url)
	return { ...running, token: tokenOf(signed.body, 'signUp') }
}
const change = (url: string, token: string, input: Record<string, unknown>) =>
	graphqlOf(url, changeQuery, { input }, bearer(token))

describe('changing a password', () => {
	it('checks the current one, ends every session and opens a new one', async () => {
		const { url, token } = await signedUp()
		const other = tokenOf((await signIn(url)).body, 'signIn')
		const changed = await change(url, token, {
			currentPassword: ada.password,
			newPassword: 'battery staple',
		})
		expect(changed.setCookie).toHaveLength(1)
		const next = tokenOf(changed.body, 'changePassword')
		expect((await viewerOf(url, token)).status).toBe(401)
		expect((await viewerOf(url, other)).status).toBe(401)
		expect((await viewerOf(url, next)).status).toBe(200)
		expect(errorOf((await signIn(url)).body)).toStrictEqual(wrong)
		expect((await signIn(url, { password: 'battery staple' })).status).toBe(200)
	})

	it('refuses a wrong current password, and checks the new one', async () => {
		const { url, token } = await signedUp()
		const refused = await change(url, token, {
			currentPassword: 'wrong password',
			newPassword: 'battery staple',
		})
		expect(errorOf(refused.body)).toStrictEqual(wrong)
		const short = await change(url, token, {
			currentPassword: ada.password,
			newPassword: 'short',
		})
		expect(errorOf(short.body)).toMatchObject({ code: 'VALIDATION_FAILED' })
		expect((await viewerOf(url, token)).status).toBe(200)
	})

	it('needs a signed-in user', async () => {
		const { url } = await signedUp()
		const anonymous = await graphqlOf(url, changeQuery, {
			input: { currentPassword: ada.password, newPassword: 'battery staple' },
		})
		expect(errorOf(anonymous.body)).toStrictEqual({ code: 'UNAUTHENTICATED' })
	})
})

describe('the commands', () => {
	it('User.signUp creates the user without a session, as anyone', async () => {
		await server()
		const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
		expect(user).toMatchObject({ name: 'Ada' })
		await expect(User.signIn(ada)).resolves.toMatchObject({
			user: { id: user.id },
		})
		await expect(
			User.signUp({
				...ada,
				email: 'bob@example.com',
				data: { name: 'Bob', note: 'x' },
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [{ path: ['data', 'note'], message: 'Unknown field.' }],
			},
		})
		const grace = await User.signUp(
			{
				...ada,
				email: 'grace@example.com',
				data: { name: 'Grace', note: 'x' },
			},
			M,
		)
		expect(grace).toMatchObject({ note: 'x' })
		await expect(
			User.signUp({ ...ada, email: 'nope', data: { name: 'Nope' } }),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('User.setPassword runs as Master or as the user, and ends the sessions', async () => {
		const { url } = await server()
		const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
		const grace = await User.signUp({
			...ada,
			email: 'grace@example.com',
			data: { name: 'Grace' },
		})
		const forged = { kind: 'master', master: { source: 'code' } } as const
		for (const options of [
			undefined,
			{ as: { kind: 'user', user: grace } as const },
			{ as: forged },
		]) {
			await expect(
				User.setPassword({ id: user.id, password: 'battery staple' }, options),
			).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		}
		const asAda: Caller = { kind: 'user', user }
		for (const options of [M, { as: asAda }]) {
			const { token } = await User.signIn(ada)
			await User.setPassword({ id: user.id, password: ada.password }, options)
			expect((await viewerOf(url, token)).status).toBe(401)
		}
		await expect(
			User.setPassword({ id: user.id, password: 'short' }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const bare = await User.create({ data: { name: 'Bare' } }, M)
		await expect(
			User.setPassword({ id: bare.id, password: 'battery staple' }, M),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('deleting the user deletes its hash', async () => {
		await server()
		const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
		await User.delete({ where: { id: user.id } }, M)
		expect(await PasswordHash.count({}, M)).toBe(0)
		await expect(User.signIn(ada)).rejects.toMatchObject(wrong)
	})
})

const start = async (
	models: Parameters<typeof defineApp>[0]['models'],
	listed?: readonly string[] | false,
) => {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			graphqlPlugin(),
			authPlugin(),
			passwordPlugin(listed === undefined ? {} : { signUp: listed }),
		],
		models,
	})
	try {
		await app.start()
	} finally {
		await app.stop()
	}
}

describe('starting', () => {
	it('needs the user model to use password()', async () => {
		const Plain = defineUser({
			name: 'User',
			fields: (f) => ({ name: f.string() }),
		})
		await expect(start([Plain], ['name'])).rejects.toThrow(
			'passwordPlugin() needs the user model to list it: add `use: [password()]` to defineUser (D-113).',
		)
		const Other = defineModel({
			name: 'Other',
			use: [password()],
			fields: (f) => ({ name: f.string() }),
		})
		await expect(start([User, Other], ['name'])).rejects.toThrow(
			'User and Other both use password(): only the user model does (D-113).',
		)
	})

	it('refuses an unknown, a reserved, a JSON or a missing field', async () => {
		await expect(start([User], ['nope'])).rejects.toThrow(
			'passwordPlugin({ signUp }): User.nope is not a field sign-up may take (D-113).',
		)
		await expect(start([User], ['id'])).rejects.toThrow(
			'User.id is not a field',
		)
		await expect(start([User], [])).rejects.toThrow(
			'passwordPlugin({ signUp }): User needs name to be created; list them (D-113).',
		)
		await expect(start([User])).rejects.toThrow('User needs name')
		const Json = defineUser({
			name: 'User',
			use: [password()],
			fields: (f) => ({ data: f.json() }),
		})
		await expect(start([Json], ['data'])).rejects.toThrow(
			'passwordPlugin({ signUp }): data is a relation or a JSON field, which sign-up does not take (D-113).',
		)
		await expect(start([User], false)).resolves.toBeUndefined()
	})
})

it('hashes with a new salt each time', async () => {
	expect(await hashPassword(ada.password)).not.toBe(
		await hashPassword(ada.password),
	)
})
