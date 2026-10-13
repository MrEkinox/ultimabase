import { authPlugin } from '@ultimabase/auth-plugin'
import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { Member, Note } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { adaPassword } from './support.ts'

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour
const invalidSession = { code: 'AUTH_INVALID_SESSION' }

// Only `Date` is faked: the clock moves when a test says so.
const travel = (ms: number) => {
	vi.setSystemTime(Date.now() + ms)
}

afterEach(() => {
	vi.useRealTimers()
})

it('ends sessions by the configured lifetimes', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	vi.useFakeTimers({ toFake: ['Date'] })
	const { session } = await Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: adaPassword,
	})
	const current = (token: string) =>
		auth.runWithSession(token, () => Member.current())

	// A session lasts `expiresInMs` (one day here) after it is issued or
	// refreshed: using it does not extend it.
	travel(23 * hour)
	expect(await current(session.token)).toMatchObject({ displayName: 'Ada' })
	travel(2 * hour)
	await expect(current(session.token)).rejects.toMatchObject(invalidSession)

	// Refreshing within each day keeps a session, up to the 30-day ceiling.
	let { session: kept } = await Member.login({
		email: 'ada@example.com',
		password: adaPassword,
	})
	for (let elapsed = 0; elapsed < 29 * day; elapsed += 20 * hour) {
		travel(20 * hour)
		;({ session: kept } = await Member.refresh(kept.token))
	}
	expect(await current(kept.token)).toMatchObject({ displayName: 'Ada' })
	expect(Date.parse(kept.expiresAt)).toBe(Date.parse(kept.absoluteExpiresAt))
	travel(day)
	await expect(Member.refresh(kept.token)).rejects.toMatchObject(invalidSession)
	expect(await t.asMaster(() => Member.count())).toBe(1)
})

it('deletes an account only after a recent authentication', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	vi.useFakeTimers({ toFake: ['Date'] })
	const { user, session } = await Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: adaPassword,
	})
	await auth.runWithSession(session.token, () =>
		Note.createOne({ data: { author: user.id, body: 'Draft' } }),
	)
	travel(6 * minute)
	await expect(
		auth.runWithSession(session.token, () => Member.deleteAccount()),
	).rejects.toMatchObject({ code: 'AUTH_REAUTHENTICATION_REQUIRED' })

	//#region delete-account
	// Proves the password again: the calls that follow through this session
	// may run sensitive operations for five minutes.
	await auth.runWithSession(session.token, () =>
		Member.reauthenticate({ password: 'correct horse battery staple' }),
	)
	const deleted = await auth.runWithSession(session.token, () =>
		Member.deleteAccount(),
	)
	//#endregion delete-account

	// The User, its sessions, linked methods and password are gone.
	expect(deleted).toStrictEqual({ deleted: true })
	expect(await t.asMaster(() => Member.count())).toBe(0)
	await expect(
		auth.runWithSession(session.token, () => Member.current()),
	).rejects.toMatchObject(invalidSession)
	await expect(
		Member.login({ email: 'ada@example.com', password: adaPassword }),
	).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
	// Application rows that name the member are the application's to clean.
	expect(await t.asMaster(() => Note.count())).toBe(1)
})

it('never unlinks the last sign-in method', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { session } = await Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: adaPassword,
	})

	//#region list-methods
	const { methods } = await auth.runWithSession(session.token, () =>
		Member.listMethods(),
	)
	//#endregion list-methods

	expect(methods).toMatchObject([
		{ email: 'ada@example.com', emailVerified: false, method: 'password' },
	])
	const [only] = methods
	if (only === undefined) throw new TypeError('Missing method')
	await expect(
		auth.runWithSession(session.token, () => Member.unlinkMethod(only.id)),
	).rejects.toMatchObject({ code: 'AUTH_LAST_METHOD' })
	expect(await t.asMaster(() => Member.count())).toBe(1)
})
