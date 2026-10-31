// When the password was set (D-169): the field password writes with the
// password, which the user and Master read and the application's hooks see.
import { authPlugin, defineUser } from '@ultimabase/auth'
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import type { Caller } from 'ultimabase'
import { allow, defineApp, memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Email, PasswordOptions } from './index.ts'
import { password, passwordPlugin } from './index.ts'
import {
	bearer,
	changeQuery,
	graphqlOf,
	M,
	signInQuery,
	tokenIn,
	tokenOf,
} from './test/app.ts'

const outbox: Email[] = []
/** The `passwordSetAt` each committed update of a member changed. */
const changes: (Date | null)[] = []

// Anyone reads the members, so the field's own rule shows.
const Member = defineUser({
	name: 'Member',
	use: [graphql(), password()],
	fields: (f) => ({ name: f.string() }),
}).with({
	access: { read: allow.public },
	hooks: {
		afterUpdateCommit: ({ record, previous }) => {
			const [now, before] = [record.passwordSetAt, previous.passwordSetAt]
			if (now?.getTime() !== before?.getTime()) changes.push(now)
		},
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	outbox.length = 0
	changes.length = 0
})

const ada = { email: 'ada@example.com', password: 'correct horse' }

async function server(
	options: Pick<PasswordOptions, 'sendEmail'> = {
		sendEmail: async (email) => {
			outbox.push(email)
		},
	},
) {
	const lines: string[] = []
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			graphqlPlugin(),
			authPlugin(),
			passwordPlugin({
				signUp: ['name'],
				...options,
			}),
		],
		models: [Member],
		logger: {
			info: (first) => {
				if (typeof first === 'string') lines.push(first)
			},
			warn: () => undefined,
			error: () => undefined,
			child() {
				return this
			},
		},
	})
	await app.start()
	stop = async () => app.stop()
	const line = lines.find((first) => first.startsWith('Listening on')) ?? ''
	const url = line.replace(/^Listening on (.*)\.$/, '$1')
	const user = await Member.signUp({ ...ada, data: { name: 'Ada' } })
	return { url, user, app }
}

const notice = (userId: string): Email => ({
	kind: 'passwordChanged',
	to: ada.email,
	userId,
})
/** Waits for the `count`th password notice. */
const told = async (count: number) =>
	vi.waitFor(() => {
		const notices = outbox.filter(({ kind }) => kind === 'passwordChanged')
		expect(notices).toHaveLength(count)
	})

const setAtOf = async (id: string) =>
	(await Member.findUnique({ where: { id } }, M))?.passwordSetAt

describe('User.passwordSetAt', () => {
	it('is the sign-up’s time, which the user and Master read', async () => {
		const before = Date.now()
		const { user } = await server()
		expect(user.passwordSetAt?.getTime()).toBeGreaterThanOrEqual(before)
		expect(user.passwordSetAt?.getTime()).toBeLessThanOrEqual(Date.now())
		const grace = await Member.signUp({
			...ada,
			email: 'grace@example.com',
			data: { name: 'Grace' },
		})
		const asGrace: Caller = { kind: 'user', user: grace }
		const rows = await Member.findMany(
			{ orderBy: { name: 'asc' } },
			{ as: asGrace },
		)
		expect(rows.map(({ passwordSetAt }) => passwordSetAt)).toStrictEqual([
			undefined,
			grace.passwordSetAt,
		])
		await expect(
			Member.update(
				{ where: { id: grace.id }, data: { passwordSetAt: new Date() } },
				{ as: asGrace },
			),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it('changes with the password, as the application’s hook sees', async () => {
		const { url, user } = await server()
		const signedIn = await graphqlOf(url, signInQuery, { input: ada })
		const session = tokenOf(signedIn.body, 'signIn')
		const input = {
			currentPassword: ada.password,
			newPassword: 'battery staple',
		}
		await graphqlOf(url, changeQuery, { input }, bearer(session))
		const changed = await setAtOf(user.id)
		expect(changed?.getTime()).toBeGreaterThan(
			user.passwordSetAt?.getTime() ?? Infinity,
		)
		await told(1)

		const requestQuery = `mutation ($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }`
		await graphqlOf(url, requestQuery, { input: { email: ada.email } })
		await vi.waitFor(() => {
			expect(outbox).toHaveLength(2)
		})
		const resetQuery = `mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }`
		const reset = { token: tokenIn(outbox[1]), password: 'staple!!' }
		await graphqlOf(url, resetQuery, { input: reset })
		const wasReset = await setAtOf(user.id)
		expect(wasReset?.getTime()).toBeGreaterThan(changed?.getTime() ?? Infinity)
		await told(2)

		await Member.setPassword({ id: user.id, password: 'set by Master' }, M)
		const set = await setAtOf(user.id)
		expect(set?.getTime()).toBeGreaterThan(wasReset?.getTime() ?? Infinity)
		await told(3)
		expect(changes).toStrictEqual([changed, wasReset, set])
		expect(outbox.filter(({ kind }) => kind === 'passwordChanged')).toEqual(
			Array.from({ length: 3 }, () => notice(user.id)),
		)
	})

	it('tells no one of the sign-up, a Master write or a closed account', async () => {
		const { user, app } = await server()
		await Member.update(
			{ where: { id: user.id }, data: { passwordSetAt: new Date(0) } },
			M,
		)
		await Member.closeAccount({ id: user.id }, M)
		await app.stop()
		expect(outbox).toStrictEqual([])
	})

	it('tells no one without sendEmail', async () => {
		const { user } = await server({})
		await Member.setPassword({ id: user.id, password: 'set by Master' }, M)
		expect(changes).toHaveLength(1)
	})

	it('is null once the account closes', async () => {
		const { user } = await server()
		await Member.closeAccount({ id: user.id }, M)
		expect(await setAtOf(user.id)).toBeNull()
		expect(changes).toStrictEqual([null])
	})
})
