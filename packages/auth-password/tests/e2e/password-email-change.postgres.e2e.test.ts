import { authErrorCodes, authPlugin } from '@ultimabase/auth-plugin'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { passwordErrorCodes } from '../../src/index.js'
import {
	createOutbox,
	createPasswordApplication,
	secret,
} from './password-fixture.js'

let fixture: PostgresWorkerFixture | undefined
const pool = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_email' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const createApplication = () => {
	const events: unknown[] = []
	const outbox = createOutbox()
	const application = createPasswordApplication(pool(), {
		email: outbox.flows,
		master: true,
		events: {
			afterEmailChanged: (event) => {
				events.push({ name: 'afterEmailChanged', ...event })
			},
		},
	})
	const signUp = (email: string) =>
		application.AuthUser.signUp({
			displayName: email,
			email,
			password: secret,
		})
	const asUser = <TResult>(token: string, run: () => Promise<TResult>) =>
		application.ultimabase.plugin(authPlugin).runWithSession(token, run)
	return { ...application, asUser, events, outbox, signUp }
}

describe('email change', { concurrent: false }, () => {
	it('confirms through the new address, notifies the old one and moves the login', async () => {
		const { AuthUser, asUser, events, outbox, signUp, ultimabase } =
			createApplication()
		await ultimabase.start()
		try {
			const signed = await signUp('ada@example.test')
			await expect(
				asUser(signed.session.token, () =>
					AuthUser.requestEmailChange({
						currentPassword: 'wrong password value',
						newEmail: 'ada@new.example.test',
					}),
				),
			).rejects.toMatchObject({ code: passwordErrorCodes.emailChangeRejected })
			await expect(
				asUser(signed.session.token, () =>
					AuthUser.requestEmailChange({
						currentPassword: secret,
						newEmail: 'ada@example.test',
					}),
				),
			).rejects.toMatchObject({ code: passwordErrorCodes.emailChangeRejected })
			await expect(
				AuthUser.requestEmailChange({
					currentPassword: secret,
					newEmail: 'ada@new.example.test',
				}),
			).rejects.toMatchObject({ code: authErrorCodes.invalidSession })
			expect(
				await asUser(signed.session.token, () =>
					AuthUser.requestEmailChange({
						currentPassword: secret,
						newEmail: ' Ada@New.example.test ',
					}),
				),
			).toStrictEqual({ accepted: true })
			await waitForAfterCommit()
			const token = outbox.tokenFor('confirmation', 'ada@new.example.test')
			expect(token).toMatch(/^ub_c1\.[A-Za-z0-9_-]{43}$/u)
			expect(outbox.sent.at(-1)?.message).toMatchObject({
				previousEmail: 'ada@example.test',
			})
			// The email does not change before confirmation.
			expect(
				await asUser(signed.session.token, () => AuthUser.current()),
			).toMatchObject({ email: 'ada@example.test' })
			expect(await AuthUser.confirmEmailChange({ token })).toStrictEqual({
				confirmed: true,
			})
			await expect(
				AuthUser.confirmEmailChange({ token }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
			await waitForAfterCommit()
			expect(outbox.sent.at(-1)).toMatchObject({
				email: 'ada@example.test',
				kind: 'notice',
				message: { newEmail: 'ada@new.example.test' },
			})
			// Sessions survive; the login moves to the new, verified address.
			expect(
				await asUser(signed.session.token, () => AuthUser.current()),
			).toMatchObject({ email: 'ada@new.example.test', emailVerified: true })
			await expect(
				AuthUser.login({ email: 'ada@example.test', password: secret }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
			await AuthUser.login({ email: 'ada@new.example.test', password: secret })
			const { methods } = await asUser(signed.session.token, () =>
				AuthUser.listMethods(),
			)
			expect(methods).toMatchObject([
				{
					email: 'ada@new.example.test',
					emailVerified: true,
					method: 'password',
				},
			])
			// The old address is free again.
			await signUp('ada@example.test')
			expect(events).toStrictEqual([
				expect.objectContaining({
					email: 'ada@new.example.test',
					name: 'afterEmailChanged',
					previousEmail: 'ada@example.test',
					userId: signed.user.id,
				}),
			])
			expect(JSON.stringify(events)).not.toContain(token)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('enforces uniqueness at confirmation, including concurrent confirmations', async () => {
		const { AuthUser, asUser, outbox, signUp, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			const first = await signUp('bob@example.test')
			const second = await signUp('carol@example.test')
			const taken = await signUp('dan@example.test')
			for (const signed of [first, second, taken]) {
				// The address is free at request time for every one of them.
				expect(
					await asUser(signed.session.token, () =>
						AuthUser.requestEmailChange({
							currentPassword: secret,
							newEmail: 'shared@example.test',
						}),
					),
				).toStrictEqual({ accepted: true })
			}
			await waitForAfterCommit()
			const tokens = outbox.sent
				.filter(({ kind }) => kind === 'confirmation')
				.map(({ message }) => String(message.token))
			expect(tokens).toHaveLength(3)
			const results = await Promise.allSettled(
				tokens
					.slice(0, 2)
					.map((token) => AuthUser.confirmEmailChange({ token })),
			)
			expect(results.map((result) => result.status).sort()).toStrictEqual([
				'fulfilled',
				'rejected',
			])
			const rejected = results.find((result) => result.status === 'rejected')
			expect(rejected?.reason).toMatchObject({
				code: passwordErrorCodes.emailChangeRejected,
			})
			await expect(
				AuthUser.confirmEmailChange({ token: tokens[2] ?? '' }),
			).rejects.toMatchObject({ code: passwordErrorCodes.emailChangeRejected })
			const owners = await AuthUser.findMany(
				{ where: { email: 'shared@example.test' } },
				{ useMasterKey: true },
			)
			expect(owners).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('cancels a pending change when the password is reset or changed', async () => {
		const { AuthUser, asUser, outbox, signUp, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			const signed = await signUp('fay@example.test')
			const request = (newEmail: string) =>
				asUser(signed.session.token, () =>
					AuthUser.requestEmailChange({ currentPassword: secret, newEmail }),
				)
			// Whoever requested the change keeps its token after the owner's reset.
			await request('attacker@example.test')
			await AuthUser.requestPasswordReset({ email: 'fay@example.test' })
			await waitForAfterCommit()
			await AuthUser.resetPassword({
				newPassword: secret,
				token: outbox.tokenFor('reset', 'fay@example.test'),
			})
			await expect(
				AuthUser.confirmEmailChange({
					token: outbox.tokenFor('confirmation', 'attacker@example.test'),
				}),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
			const login = await AuthUser.login({
				email: 'fay@example.test',
				password: secret,
			})
			await asUser(login.session.token, () =>
				AuthUser.requestEmailChange({
					currentPassword: secret,
					newEmail: 'other@example.test',
				}),
			)
			await asUser(login.session.token, () =>
				AuthUser.changePassword({
					currentPassword: secret,
					newPassword: 'another correct horse battery staple',
				}),
			)
			await waitForAfterCommit()
			await expect(
				AuthUser.confirmEmailChange({
					token: outbox.tokenFor('confirmation', 'other@example.test'),
				}),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('expires confirmation tokens and keeps verification tokens bound to their email', async () => {
		const { AuthUser, asUser, outbox, signUp, ultimabase } = createApplication()
		await ultimabase.start()
		const now = Date.now()
		try {
			const signed = await signUp('erin@example.test')
			await waitForAfterCommit()
			const verification = outbox.tokenFor('verification', 'erin@example.test')
			await asUser(signed.session.token, () =>
				AuthUser.requestEmailChange({
					currentPassword: secret,
					newEmail: 'erin@new.example.test',
				}),
			)
			await waitForAfterCommit()
			await AuthUser.confirmEmailChange({
				token: outbox.tokenFor('confirmation', 'erin@new.example.test'),
			})
			// The verification token was for the replaced address.
			await expect(
				AuthUser.verifyEmail({ token: verification }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
			await asUser(signed.session.token, () =>
				AuthUser.requestEmailChange({
					currentPassword: secret,
					newEmail: 'erin@later.example.test',
				}),
			)
			await waitForAfterCommit()
			vi.useFakeTimers({ now: now + 60 * 60_000 + 1000, toFake: ['Date'] })
			await expect(
				AuthUser.confirmEmailChange({
					token: outbox.tokenFor('confirmation', 'erin@later.example.test'),
				}),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})
})
