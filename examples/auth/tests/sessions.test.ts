import { authPlugin } from '@ultimabase/auth-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Member, Note } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { adaPassword, newPassword } from './support.ts'

const denied = { code: 'PERMISSION_DENIED' }
const invalidSession = { code: 'AUTH_INVALID_SESSION' }

const signUpAda = () =>
	Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: adaPassword,
	})

it('gives Access rules the member of the session', async () => {
	await using t = await testApplication(ultimabase)
	const { user, session } = await signUpAda()
	const grace = await Member.signUp({
		displayName: 'Grace',
		email: 'grace@example.com',
		password: adaPassword,
	})

	//#region current
	const auth = ultimabase.plugin(authPlugin)
	const me = await auth.runWithSession(session.token, () => Member.current())
	//#endregion current

	expect(me).toMatchObject({ displayName: 'Ada', id: user.id })

	//#region principal
	const notes = await auth.runWithSession(session.token, async () => {
		await Note.createOne({ data: { author: user.id, body: 'Call Grace' } })
		return Note.findMany()
	})
	//#endregion principal

	expect(notes).toMatchObject([{ author: user.id, body: 'Call Grace' }])
	// Another member reads none of them and cannot write in Ada's name.
	expect(
		await auth.runWithSession(grace.session.token, () => Note.findMany()),
	).toStrictEqual([])
	await expect(
		auth.runWithSession(grace.session.token, () =>
			Note.createOne({ data: { author: user.id, body: 'Forged' } }),
		),
	).rejects.toMatchObject(denied)
	// Each member reads only their own profile (`read: isSelf`); without a
	// session, nothing.
	//#region own-profile
	const profiles = await auth.runWithSession(grace.session.token, () =>
		Member.findMany(),
	)
	//#endregion own-profile
	expect(profiles).toMatchObject([{ id: grace.user.id }])
	await expect(Member.findMany()).rejects.toMatchObject(denied)
	await expect(Note.findMany()).rejects.toMatchObject(denied)
	await expect(Member.current()).rejects.toMatchObject(invalidSession)
	await expect(
		auth.runWithSession('ub_s1.forged', () => Member.current()),
	).rejects.toMatchObject(invalidSession)
	expect(await t.asMaster(() => Note.count())).toBe(1)
})

it('lists, revokes, rotates and ends sessions', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { session: laptop } = await signUpAda()
	const { session: phone } = await Member.login({
		email: 'ada@example.com',
		password: adaPassword,
	})

	//#region list-sessions
	const { sessions } = await auth.runWithSession(laptop.token, () =>
		Member.listSessions(),
	)
	//#endregion list-sessions

	// Newest first, never with a token; `current` marks the caller's own.
	expect(sessions).toMatchObject([
		{ current: false, id: phone.id, method: 'password' },
		{ current: true, id: laptop.id, method: 'password' },
	])
	expect(sessions[0]).not.toHaveProperty('token')

	//#region revoke-session
	await auth.runWithSession(laptop.token, () => Member.revokeSession(phone.id))
	//#endregion revoke-session

	await expect(
		auth.runWithSession(phone.token, () => Member.current()),
	).rejects.toMatchObject(invalidSession)

	//#region refresh-logout
	const rotated = await Member.refresh(laptop.token)
	await Member.logout(rotated.session.token)
	//#endregion refresh-logout

	// Refresh keeps the session and replaces its token; logout ends it.
	expect(rotated.session.id).toBe(laptop.id)
	await expect(Member.refresh(laptop.token)).rejects.toMatchObject(
		invalidSession,
	)
	await expect(
		auth.runWithSession(rotated.session.token, () => Member.current()),
	).rejects.toMatchObject(invalidSession)
	expect(await t.asMaster(() => Member.count())).toBe(1)
})

it('changes the password and keeps only the current session', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { session } = await signUpAda()
	const other = await Member.login({
		email: 'ada@example.com',
		password: adaPassword,
	})

	//#region change-password
	await auth.runWithSession(session.token, () =>
		Member.changePassword({
			currentPassword: 'correct horse battery staple',
			newPassword: 'another correct horse battery staple',
		}),
	)
	//#endregion change-password

	expect(
		await auth.runWithSession(session.token, () => Member.current()),
	).toMatchObject({ email: 'ada@example.com' })
	await expect(
		auth.runWithSession(other.session.token, () => Member.current()),
	).rejects.toMatchObject(invalidSession)
	await expect(
		Member.login({ email: 'ada@example.com', password: adaPassword }),
	).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
	// A wrong current password changes nothing.
	await expect(
		auth.runWithSession(session.token, () =>
			Member.changePassword({
				currentPassword: adaPassword,
				newPassword: 'yet another correct horse battery',
			}),
		),
	).rejects.toMatchObject({ code: 'AUTH_PASSWORD_CHANGE_REJECTED' })
	const { session: tablet } = await Member.login({
		email: 'ada@example.com',
		password: newPassword,
	})

	//#region logout-everywhere
	await auth.runWithSession(tablet.token, () => Member.logoutEverywhere())
	//#endregion logout-everywhere

	for (const token of [session.token, tablet.token]) {
		await expect(
			auth.runWithSession(token, () => Member.current()),
		).rejects.toMatchObject(invalidSession)
	}
	expect(await t.asMaster(() => Member.count())).toBe(1)
})

it('administers sessions from server code', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { user, session } = await signUpAda()

	//#region admin-sessions
	// Server-only exports: clients never reach them.
	const live = await auth.listSessions(user)
	await auth.revokeSessions(user)
	//#endregion admin-sessions

	expect(live).toMatchObject([{ id: session.id, method: 'password' }])
	expect(await auth.listSessions(user)).toStrictEqual([])
	await expect(
		auth.runWithSession(session.token, () => Member.current()),
	).rejects.toMatchObject(invalidSession)
	expect(await t.asMaster(() => Member.count())).toBe(1)
})
