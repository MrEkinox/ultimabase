// `User.checkPassword` (D-161): the current password checked before a
// sensitive action, as Master or as the user, counted with or without a
// client, and no session opened.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authPlugin, isAuthenticated, signedInRun } from '@ultimabase/auth'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Caller, Client } from 'ultimabase'
import { defineApp, defineFunction, memory } from 'ultimabase'
import { z } from 'zod'
import { passwordPlugin } from './index.ts'
import { bearer, changeQuery, graphqlOf, M, started, User } from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	await stop?.()
	stop = undefined
})

/** A database that records the model of each row it inserts. */
function recording(): Adapter & { readonly created: string[] } {
	const database = memory()
	const created: string[] = []
	const record = (write: Parameters<Adapter['write']>[0]) => {
		for (const change of write.changes) {
			if (change.kind === 'insert') created.push(change.model)
		}
	}
	return {
		created,
		start: async (schema, logger) => database.start(schema, logger),
		stop: async () => database.stop(),
		begin: async () => {
			const transaction = await database.begin()
			return {
				find: async (read) => transaction.find(read),
				count: async (read) => transaction.count(read),
				aggregate: async (read) => transaction.aggregate(read),
				write: async (write) => {
					record(write)
					return transaction.write(write)
				},
				commit: async () => transaction.commit(),
				rollback: async () => transaction.rollback(),
			}
		},
		find: async (read) => database.find(read),
		count: async (read) => database.count(read),
		aggregate: async (read) => database.aggregate(read),
		write: async (write) => {
			record(write)
			return database.write(write)
		},
	}
}

const ada = { email: 'ada@example.com', password: 'correct horse' }

async function signedUp(database?: Adapter) {
	const running = await started(undefined, database)
	stop = async () => running.app.stop()
	const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
	const asAda: Caller = { kind: 'user', user }
	return { ...running, user, asAda }
}

const clientAt = (address: string): Client => ({
	address,
	cookies: {
		get: () => undefined,
		set: () => undefined,
		clear: () => undefined,
	},
})

const wrong = {
	code: 'INVALID_CREDENTIALS',
	message: 'Wrong password.',
}
const tooMany = { code: 'TOO_MANY_ATTEMPTS' }

// D-161's example: a function hands its `client`, `undefined` from server
// code, to the commands as it gets it (#67).
const reauthenticate = defineFunction({
	name: 'reauthenticate',
	input: z.object({ password: z.string() }),
	output: z.boolean(),
	run: signedInRun(async ({ input, caller, client, user }) => {
		await User.checkPassword(
			{ id: user.id, password: input.password },
			{ as: caller, client },
		)
		await User.signIn(
			{ email: ada.email, password: input.password },
			{ client },
		)
		return true
	}),
}).with({ access: isAuthenticated })

describe('User.checkPassword', () => {
	it('checks the current password and opens no session', async () => {
		const database = recording()
		const { user, asAda } = await signedUp(database)
		expect(database.created).toContain('PasswordHash')
		database.created.length = 0
		await expect(
			User.checkPassword(
				{ id: user.id, password: ada.password },
				{ as: asAda },
			),
		).resolves.toBeUndefined()
		expect(database.created).not.toContain('AuthSession')
		await User.signIn(ada)
		expect(database.created).toContain('AuthSession')
		await expect(
			User.checkPassword(
				{ id: user.id, password: 'wrong password' },
				{ as: asAda },
			),
		).rejects.toMatchObject(wrong)
	})

	it('refuses a user without a password and an unknown id alike', async () => {
		await signedUp()
		const bare = await User.create({ data: { name: 'Bare' } }, M)
		for (const id of [bare.id, 'unknown']) {
			await expect(
				User.checkPassword({ id, password: ada.password }, M),
			).rejects.toMatchObject(wrong)
		}
	})

	it('runs as Master or as the user', async () => {
		const { user } = await signedUp()
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
				User.checkPassword({ id: user.id, password: ada.password }, options),
			).rejects.toMatchObject({
				code: 'ACCESS_DENIED',
				message: 'User.checkPassword runs as Master or as the user.',
			})
		}
		await User.checkPassword({ id: user.id, password: ada.password }, M)
	})

	it('refuses the eleventh failure on a user without a client', async () => {
		const { user, asAda } = await signedUp()
		const check = async (password: string) =>
			User.checkPassword({ id: user.id, password }, { as: asAda }).catch(
				(error: unknown) => error,
			)
		for (let failure = 0; failure < 10; failure += 1) {
			expect(await check('wrong password')).toMatchObject(wrong)
		}
		// Refused even with the right password, until the failures are old.
		expect(await check(ada.password)).toMatchObject(tooMany)
		const later = Date.now() + 15 * 60 * 1000
		vi.spyOn(Date, 'now').mockReturnValue(later)
		expect(await check(ada.password)).toBeUndefined()
	})

	it('shares its count with changePassword', async () => {
		const { url, user, asAda } = await signedUp()
		const { token } = await User.signIn(ada)
		for (let failure = 0; failure < 5; failure += 1) {
			const changed = await graphqlOf(
				url,
				changeQuery,
				{
					input: {
						currentPassword: 'wrong password',
						newPassword: 'battery staple',
					},
				},
				bearer(token),
			)
			expect(JSON.stringify(changed.body)).toContain('Wrong password.')
		}
		const failed = async () =>
			User.checkPassword(
				{ id: user.id, password: 'wrong password' },
				{ as: asAda },
			).catch((error: unknown) => error)
		for (let failure = 0; failure < 5; failure += 1) {
			expect(await failed()).toMatchObject(wrong)
		}
		expect(await failed()).toMatchObject(tooMany)
	})

	it("takes a function's client as the function gets it", async () => {
		const app = defineApp({
			database: memory(),
			plugins: [
				httpPlugin({ port: 0 }),
				graphqlPlugin(),
				authPlugin(),
				passwordPlugin({ signUp: false }),
			],
			models: [User],
			functions: [reauthenticate],
		})
		await app.start()
		stop = async () => app.stop()
		const user = await User.signUp({ ...ada, data: { name: 'Ada' } }, M)
		const asAda: Caller = { kind: 'user', user }
		await expect(
			reauthenticate.run({ password: ada.password }, { as: asAda }),
		).resolves.toBe(true)
		await expect(
			reauthenticate.run({ password: 'wrong password' }, { as: asAda }),
		).rejects.toMatchObject(wrong)
	})

	it('counts a client as changePassword does: per address', async () => {
		const { user, asAda } = await signedUp()
		const check = async (address: string) =>
			User.checkPassword(
				{ id: user.id, password: 'wrong password' },
				{ as: asAda, client: clientAt(address) },
			).catch((error: unknown) => error)
		for (let failure = 0; failure < 10; failure += 1) {
			expect(await check('203.0.113.7')).toMatchObject(wrong)
		}
		expect(await check('203.0.113.7')).toMatchObject(tooMany)
		expect(await check('198.51.100.1')).toMatchObject(wrong)
		await User.checkPassword(
			{ id: user.id, password: ada.password },
			{ as: asAda, client: clientAt('198.51.100.1') },
		)
	})
})
