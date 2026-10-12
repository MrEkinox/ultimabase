import { authErrorCodes, authPlugin } from '@ultimabase/auth-plugin'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { createPasswordApplication, secret } from './password-fixture.js'

let fixture: PostgresWorkerFixture | undefined
const pool = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_password' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

describe('password sign-up, login and sessions', { concurrent: false }, () => {
	it('signs up without masterAuthority, names missing fields and rejects duplicates', async () => {
		const { AuthUser, ultimabase } = createPasswordApplication(pool())
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Ada',
				email: ' Ada@Example.test ',
				password: secret,
			})
			expect(signed.user).toMatchObject({
				displayName: 'Ada',
				email: 'ada@example.test',
			})
			expect(signed.session.token).toMatch(/^ub_s1\.[A-Za-z0-9_-]{43}$/u)
			await expect(
				AuthUser.signUp({
					email: 'grace@example.test',
					password: secret,
				} as Parameters<typeof AuthUser.signUp>[0]),
			).rejects.toMatchObject({
				code: authErrorCodes.signUpRejected,
				publicDetails: { fields: ['displayName'] },
			})
			await expect(
				AuthUser.signUp({
					displayName: 'Ada again',
					email: 'ADA@example.test',
					password: secret,
				}),
			).rejects.toMatchObject({ code: authErrorCodes.signUpRejected })
			await expect(
				AuthUser.signUp({
					displayName: 'Bad',
					email: 'not an email',
					password: 'short',
				}),
			).rejects.toMatchObject({
				publicDetails: { fields: ['email', 'password'] },
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('logs in without enumeration, reads the current user and rotates and revokes sessions', async () => {
		const { AuthUser, ultimabase } = createPasswordApplication(pool())
		await ultimabase.start()
		try {
			await AuthUser.signUp({
				displayName: 'Bob',
				email: 'bob@example.test',
				password: secret,
			})
			for (const credentials of [
				{ email: 'bob@example.test', password: 'wrong password value' },
				{ email: 'nobody@example.test', password: secret },
			]) {
				await expect(AuthUser.login(credentials)).rejects.toMatchObject({
					code: authErrorCodes.invalidCredentials,
					message: 'Authentication credentials were rejected.',
				})
			}
			const first = await AuthUser.login({
				email: 'BOB@example.test',
				password: secret,
			})
			const auth = ultimabase.plugin(authPlugin)
			const me = await auth.runWithSession(first.session.token, () =>
				AuthUser.current(),
			)
			expect(me.email).toBe('bob@example.test')
			const refreshed = await AuthUser.refresh(first.session.token)
			expect(refreshed.session.id).toBe(first.session.id)
			expect(refreshed.session.token).not.toBe(first.session.token)
			await expect(AuthUser.refresh(first.session.token)).rejects.toMatchObject(
				{ code: authErrorCodes.invalidSession },
			)
			await AuthUser.logout(refreshed.session.token)
			await expect(
				auth.runWithSession(refreshed.session.token, () => AuthUser.current()),
			).rejects.toMatchObject({ code: authErrorCodes.invalidSession })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('lists and revokes sessions, logs out everywhere and exposes Master helpers', async () => {
		const { AuthUser, ultimabase } = createPasswordApplication(pool())
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Carol',
				email: 'carol@example.test',
				password: secret,
			})
			const second = await AuthUser.login({
				email: 'carol@example.test',
				password: secret,
			})
			const auth = ultimabase.plugin(authPlugin)
			const listed = await auth.runWithSession(signed.session.token, () =>
				AuthUser.listSessions(),
			)
			expect(listed.sessions.map(({ id }) => id).sort()).toStrictEqual(
				[signed.session.id, second.session.id].sort(),
			)
			expect(listed.sessions.find(({ current }) => current)?.id).toBe(
				signed.session.id,
			)
			expect(listed.sessions[0]).not.toHaveProperty('token')
			await auth.runWithSession(signed.session.token, () =>
				AuthUser.revokeSession(second.session.id),
			)
			await expect(
				auth.runWithSession(second.session.token, () => AuthUser.current()),
			).rejects.toMatchObject({ code: authErrorCodes.invalidSession })
			await expect(
				auth.runWithSession(signed.session.token, () =>
					AuthUser.revokeSession(second.session.id),
				),
			).rejects.toMatchObject({ code: authErrorCodes.notFound })

			const third = await AuthUser.login({
				email: 'carol@example.test',
				password: secret,
			})
			expect(await auth.listSessions(signed.user)).toHaveLength(2)
			await auth.revokeSessions(signed.user.id)
			expect(await auth.listSessions(signed.user)).toHaveLength(0)
			await expect(
				auth.runWithSession(third.session.token, () => AuthUser.current()),
			).rejects.toMatchObject({ code: authErrorCodes.invalidSession })

			const fourth = await AuthUser.login({
				email: 'carol@example.test',
				password: secret,
			})
			const fifth = await AuthUser.login({
				email: 'carol@example.test',
				password: secret,
			})
			await auth.runWithSession(fourth.session.token, () =>
				AuthUser.logoutEverywhere(),
			)
			for (const token of [fourth.session.token, fifth.session.token]) {
				await expect(
					auth.runWithSession(token, () => AuthUser.current()),
				).rejects.toMatchObject({ code: authErrorCodes.invalidSession })
			}
		} finally {
			await ultimabase.dispose()
		}
	})

	it('changes the password, revoking the other sessions only when configured', async () => {
		for (const revokeOnPasswordChange of [true, false]) {
			const { AuthUser, ultimabase } = createPasswordApplication(pool(), {
				revokeOnPasswordChange,
			})
			await ultimabase.start()
			try {
				const email = `dan-${String(revokeOnPasswordChange)}@example.test`
				const current = await AuthUser.signUp({
					displayName: 'Dan',
					email,
					password: secret,
				})
				const other = await AuthUser.login({ email, password: secret })
				const auth = ultimabase.plugin(authPlugin)
				await expect(
					auth.runWithSession(current.session.token, () =>
						AuthUser.changePassword({
							currentPassword: 'wrong password value',
							newPassword: 'another correct horse battery',
						}),
					),
				).rejects.toMatchObject({ code: 'AUTH_PASSWORD_CHANGE_REJECTED' })
				expect(
					await auth.runWithSession(current.session.token, () =>
						AuthUser.changePassword({
							currentPassword: secret,
							newPassword: 'another correct horse battery',
						}),
					),
				).toStrictEqual({ changed: true })
				await expect(
					auth.runWithSession(current.session.token, () => AuthUser.current()),
				).resolves.toMatchObject({ email })
				const otherSession = auth.runWithSession(other.session.token, () =>
					AuthUser.current(),
				)
				if (revokeOnPasswordChange) {
					await expect(otherSession).rejects.toMatchObject({
						code: authErrorCodes.invalidSession,
					})
				} else {
					await expect(otherSession).resolves.toMatchObject({ email })
				}
				await expect(
					AuthUser.login({ email, password: secret }),
				).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
				await AuthUser.login({
					email,
					password: 'another correct horse battery',
				})
			} finally {
				await ultimabase.dispose()
			}
		}
	})

	it('deletes an account only after a recent login or reauthentication', async () => {
		const { AuthUser, ultimabase } = createPasswordApplication(pool())
		await ultimabase.start()
		const now = Date.now()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Eve',
				email: 'eve@example.test',
				password: secret,
			})
			const auth = ultimabase.plugin(authPlugin)
			const inSession = <TResult>(run: () => Promise<TResult>) =>
				auth.runWithSession(signed.session.token, run)
			vi.useFakeTimers({ toFake: ['Date'] })
			vi.setSystemTime(now + 2 * 60_000)
			await expect(
				inSession(() => AuthUser.deleteAccount()),
			).rejects.toMatchObject({ code: authErrorCodes.reauthenticationRequired })
			await expect(
				inSession(() =>
					AuthUser.reauthenticate({ password: 'wrong password value' }),
				),
			).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
			expect(
				await inSession(() => AuthUser.reauthenticate({ password: secret })),
			).toStrictEqual({ reauthenticated: true })
			expect(await inSession(() => AuthUser.deleteAccount())).toStrictEqual({
				deleted: true,
			})
			vi.useRealTimers()
			expect(
				await AuthUser.findOne(
					{ where: { email: 'eve@example.test' } },
					{ useMasterKey: true },
				).catch(() => 'no authority'),
			).toBe('no authority')
			await expect(
				AuthUser.login({ email: 'eve@example.test', password: secret }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
			await expect(inSession(() => AuthUser.current())).rejects.toMatchObject({
				code: authErrorCodes.invalidSession,
			})
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})

	it('emits typed events after commit, without secrets', async () => {
		const events: unknown[] = []
		const record = (name: string) => (event: object) => {
			events.push({ name, ...event })
		}
		const { AuthUser, ultimabase } = createPasswordApplication(pool(), {
			events: {
				afterLogin: record('afterLogin'),
				afterLoginFailed: record('afterLoginFailed'),
				afterLogout: record('afterLogout'),
				afterSignUp: record('afterSignUp'),
			},
		})
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Fay',
				email: 'fay@example.test',
				password: secret,
			})
			await expect(
				AuthUser.login({
					email: 'fay@example.test',
					password: 'wrong password value',
				}),
			).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
			const login = await AuthUser.login({
				email: 'fay@example.test',
				password: secret,
			})
			await AuthUser.logout(login.session.token)
			await waitForAfterCommit()
			expect(
				events.map((event) => (event as { name: string }).name),
			).toStrictEqual([
				'afterSignUp',
				'afterLoginFailed',
				'afterLogin',
				'afterLogout',
			])
			expect(events[0]).toMatchObject({
				method: 'password',
				sessionId: signed.session.id,
				userId: signed.user.id,
			})
			expect(events[1]).toMatchObject({
				identifier: 'fay@example.test',
				limited: false,
			})
			const serialized = JSON.stringify(events)
			for (const forbidden of [
				secret,
				'wrong password value',
				signed.session.token,
				login.session.token,
			]) {
				expect(serialized).not.toContain(forbidden)
			}
		} finally {
			await ultimabase.dispose()
		}
	})
})
