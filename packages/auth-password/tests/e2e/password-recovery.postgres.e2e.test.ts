import { createHash } from 'node:crypto'

import {
	authErrorCodes,
	authPlugin,
	type AuthEventHandlers,
} from '@ultimabase/auth-plugin'
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
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_recovery' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const newSecret = 'another correct horse battery staple'

/** Every row of every table in the worker schema, as JSON. */
const storedRows = async (): Promise<string> => {
	const tables = await pool().query<{ table_name: string }>(
		'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()',
	)
	const rows = await Promise.all(
		tables.rows.map(async ({ table_name: table }) =>
			JSON.stringify(
				(await pool().query(`SELECT * FROM "${table.replaceAll('"', '""')}"`))
					.rows,
			),
		),
	)
	return rows.join('\n')
}

const createApplication = <const TRequireVerifiedEmail extends boolean = false>(
	options: Readonly<{
		events?: AuthEventHandlers
		requireVerifiedEmail?: TRequireVerifiedEmail
	}> = {},
) => {
	const outbox = createOutbox({
		...(options.requireVerifiedEmail === undefined
			? {}
			: { requireVerifiedEmail: options.requireVerifiedEmail }),
	})
	const application = createPasswordApplication(pool(), {
		email: outbox.flows,
		master: true,
		...(options.events === undefined ? {} : { events: options.events }),
	})
	return { ...application, outbox }
}

describe('password reset', { concurrent: false }, () => {
	it('answers known and unknown emails alike and stores only token digests', async () => {
		const { AuthUser, outbox, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			await AuthUser.signUp({
				displayName: 'Ada',
				email: 'ada@example.test',
				password: secret,
			})
			const known = await AuthUser.requestPasswordReset({
				email: ' ADA@example.test ',
			})
			const unknown = await AuthUser.requestPasswordReset({
				email: 'nobody@example.test',
			})
			const malformed = await AuthUser.requestPasswordReset({
				email: 'not an email',
			})
			expect(known).toStrictEqual({ accepted: true })
			expect(unknown).toStrictEqual(known)
			expect(malformed).toStrictEqual(known)
			await waitForAfterCommit()
			const resets = outbox.sent.filter(({ kind }) => kind === 'reset')
			expect(resets.map(({ email }) => email)).toStrictEqual([
				'ada@example.test',
			])
			const token = outbox.tokenFor('reset', 'ada@example.test')
			expect(token).toMatch(/^ub_r1\.[A-Za-z0-9_-]{43}$/u)
			expect(resets[0]?.message).toMatchObject({
				user: { displayName: 'Ada', email: 'ada@example.test' },
			})
			// One hour by default.
			expect(
				Date.parse(String(resets[0]?.message.expiresAt)) - Date.now(),
			).toBeGreaterThan(59 * 60_000)
			const rows = await storedRows()
			expect(rows).not.toContain(token)
			expect(rows).toContain(createHash('sha256').update(token).digest('hex'))
		} finally {
			await ultimabase.dispose()
		}
	})

	it('resets once, revokes every session, verifies the email and emits the event', async () => {
		const events: unknown[] = []
		const { AuthUser, outbox, ultimabase } = createApplication({
			events: {
				afterEmailVerified: (event) => {
					events.push({ name: 'afterEmailVerified', ...event })
				},
				afterPasswordReset: (event) => {
					events.push({ name: 'afterPasswordReset', ...event })
				},
			},
		})
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Bob',
				email: 'bob@example.test',
				password: secret,
			})
			expect(signed.user).toMatchObject({
				emailVerified: false,
				emailVerifiedAt: null,
			})
			const other = await AuthUser.login({
				email: 'bob@example.test',
				password: secret,
			})
			await AuthUser.requestPasswordReset({ email: 'bob@example.test' })
			await waitForAfterCommit()
			const token = outbox.tokenFor('reset', 'bob@example.test')
			await expect(
				AuthUser.resetPassword({ newPassword: 'short', token }),
			).rejects.toMatchObject({
				code: passwordErrorCodes.passwordChangeRejected,
			})
			expect(
				await AuthUser.resetPassword({ newPassword: newSecret, token }),
			).toStrictEqual({ reset: true })
			await expect(
				AuthUser.resetPassword({ newPassword: newSecret, token }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
			const auth = ultimabase.plugin(authPlugin)
			for (const session of [signed.session, other.session]) {
				await expect(
					auth.runWithSession(session.token, () => AuthUser.current()),
				).rejects.toMatchObject({ code: authErrorCodes.invalidSession })
			}
			await expect(
				AuthUser.login({ email: 'bob@example.test', password: secret }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
			const login = await AuthUser.login({
				email: 'bob@example.test',
				password: newSecret,
			})
			expect(login.user.emailVerified).toBe(true)
			expect(Date.parse(String(login.user.emailVerifiedAt))).not.toBeNaN()
			await waitForAfterCommit()
			expect(events).toStrictEqual([
				expect.objectContaining({
					email: 'bob@example.test',
					name: 'afterEmailVerified',
					userId: signed.user.id,
				}),
				expect.objectContaining({
					name: 'afterPasswordReset',
					userId: signed.user.id,
				}),
			])
			const serialized = JSON.stringify(events)
			expect(serialized).not.toContain(token)
			expect(serialized).not.toContain(newSecret)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('cancels older tokens and rejects expired ones', async () => {
		const { AuthUser, outbox, ultimabase } = createApplication()
		await ultimabase.start()
		const now = Date.now()
		try {
			await AuthUser.signUp({
				displayName: 'Carol',
				email: 'carol@example.test',
				password: secret,
			})
			await AuthUser.requestPasswordReset({ email: 'carol@example.test' })
			await waitForAfterCommit()
			const first = outbox.tokenFor('reset', 'carol@example.test')
			await AuthUser.requestPasswordReset({ email: 'carol@example.test' })
			await waitForAfterCommit()
			const second = outbox.tokenFor('reset', 'carol@example.test')
			expect(second).not.toBe(first)
			await expect(
				AuthUser.resetPassword({ newPassword: newSecret, token: first }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
			// One hour by default: the token is refused a second later.
			vi.useFakeTimers({ now: now + 60 * 60_000 + 1000, toFake: ['Date'] })
			await expect(
				AuthUser.resetPassword({ newPassword: newSecret, token: second }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
			// Tokens never cross purposes.
			await expect(
				AuthUser.verifyEmail({ token: second }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidToken })
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})

	it('limits reset requests per address alike for known and unknown emails', async () => {
		vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
		const { AuthUser, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			await AuthUser.signUp({
				displayName: 'Dan',
				email: 'dan@example.test',
				password: secret,
			})
			// Outside HTTP only the per-account limit applies: twenty are free.
			for (const email of ['dan@example.test', 'unknown-dan@example.test']) {
				for (let request = 0; request < 21; request += 1) {
					await AuthUser.requestPasswordReset({ email })
				}
				await expect(
					AuthUser.requestPasswordReset({ email }),
				).rejects.toMatchObject({ code: authErrorCodes.tooManyAttempts })
			}
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})
})

describe('email verification', { concurrent: false }, () => {
	it('sends a token at sign-up, verifies once and ignores verified or unknown addresses', async () => {
		const { AuthUser, outbox, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Eve',
				email: 'eve@example.test',
				password: secret,
			})
			await waitForAfterCommit()
			const token = outbox.tokenFor('verification', 'eve@example.test')
			expect(token).toMatch(/^ub_v1\.[A-Za-z0-9_-]{43}$/u)
			expect(await AuthUser.verifyEmail({ token })).toStrictEqual({
				verified: true,
			})
			await expect(AuthUser.verifyEmail({ token })).rejects.toMatchObject({
				code: authErrorCodes.invalidToken,
			})
			const me = await ultimabase
				.plugin(authPlugin)
				.runWithSession(signed.session.token, () => AuthUser.current())
			expect(me.emailVerified).toBe(true)
			expect(Date.parse(String(me.emailVerifiedAt))).not.toBeNaN()
			const before = outbox.sent.length
			for (const email of ['eve@example.test', 'nobody@example.test']) {
				expect(
					await AuthUser.requestEmailVerification({ email }),
				).toStrictEqual({ accepted: true })
			}
			await waitForAfterCommit()
			expect(outbox.sent).toHaveLength(before)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('issues no session until the email is verified with requireVerifiedEmail', async () => {
		// A session issued before the requirement: its refresh waits too.
		const open = createApplication()
		await open.ultimabase.start()
		const earlier = await open.AuthUser.signUp({
			displayName: 'Finn',
			email: 'finn@example.test',
			password: secret,
		})
			.then(({ session }) => session.token)
			.finally(() => open.ultimabase.dispose())
		const { AuthUser, outbox, ultimabase } = createApplication({
			requireVerifiedEmail: true,
		})
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Gil',
				email: 'gil@example.test',
				password: secret,
			})
			expect(Object.keys(signed).sort()).toStrictEqual([
				'user',
				'verificationRequired',
			])
			expect(signed.verificationRequired).toBe(true)
			expect(signed.user).toMatchObject({
				email: 'gil@example.test',
				emailVerified: false,
			})
			await expect(
				AuthUser.login({ email: 'gil@example.test', password: secret }),
			).rejects.toMatchObject({ code: authErrorCodes.emailNotVerified })
			// A wrong password never learns the verification state.
			await expect(
				AuthUser.login({
					email: 'gil@example.test',
					password: 'wrong password value',
				}),
			).rejects.toMatchObject({ code: authErrorCodes.invalidCredentials })
			await expect(AuthUser.refresh(earlier)).rejects.toMatchObject({
				code: authErrorCodes.emailNotVerified,
			})
			await waitForAfterCommit()
			await AuthUser.verifyEmail({
				token: outbox.tokenFor('verification', 'gil@example.test'),
			})
			const login = await AuthUser.login({
				email: 'gil@example.test',
				password: secret,
			})
			expect(login.user).toMatchObject({ emailVerified: true })
			await AuthUser.requestEmailVerification({ email: 'finn@example.test' })
			await waitForAfterCommit()
			await AuthUser.verifyEmail({
				token: outbox.tokenFor('verification', 'finn@example.test'),
			})
			const refreshed = await AuthUser.refresh(earlier)
			expect(refreshed.session.token).toMatch(/^ub_s1\./u)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('lets only the authentication flows write the email fields and create Users', async () => {
		const { AuthUser, ultimabase } = createApplication()
		await ultimabase.start()
		try {
			const signed = await AuthUser.signUp({
				displayName: 'Gus',
				email: 'gus@example.test',
				password: secret,
			})
			const master = { useMasterKey: true } as const
			// Core refuses forbidden-input fields to every caller, Master included.
			for (const data of [
				{ email: 'other@example.test' },
				{ emailVerified: true },
				{ emailVerifiedAt: new Date().toISOString() },
			]) {
				await expect(
					AuthUser.updateOne(
						// @ts-expect-error -- The email fields accept no update input.
						{ data, where: { id: signed.user.id } },
						master,
					),
				).rejects.toThrow()
			}
			await expect(
				AuthUser.createOne(
					// @ts-expect-error -- The email is not a create field.
					{ data: { displayName: 'Hal', email: 'hal@example.test' } },
					master,
				),
			).rejects.toThrow()
			// Only sign-up creates Users: it sets their email. Authentication
			// closes the generic create (ADR-0341).
			await expect(
				AuthUser.createOne({ data: { displayName: 'Ivy' } }, master),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				publicDetails: {
					issues: [expect.objectContaining({ code: 'command.closed' })],
				},
			})
			// Code run as the session's user is the application's, not the
			// plugin's: it cannot create Users either.
			await expect(
				ultimabase
					.plugin(authPlugin)
					.runWithSession(signed.session.token, () =>
						AuthUser.createOne({ data: { displayName: 'Jo' } }),
					),
			).rejects.toMatchObject({
				publicDetails: {
					issues: [expect.objectContaining({ code: 'command.closed' })],
				},
			})
			// The managed write refuses Master callers outside the flows.
			const write: unknown = Reflect.get(
				AuthUser,
				'ultimabaseAuthWriteEmailOne',
			)
			if (typeof write !== 'function') throw new TypeError('No email write')
			await expect(
				Promise.resolve().then((): unknown =>
					Reflect.apply(write, AuthUser, [
						{ id: signed.user.id, input: { emailVerified: true } },
						master,
					]),
				),
			).rejects.toThrow()
			const unchanged = await AuthUser.findOne(
				{ where: { id: signed.user.id } },
				master,
			)
			expect(unchanged).toMatchObject({
				email: 'gus@example.test',
				emailVerified: false,
				emailVerifiedAt: null,
			})
		} finally {
			await ultimabase.dispose()
		}
	})
})
