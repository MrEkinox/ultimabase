// password on PostgreSQL (D-110, D-113, D-117): sign-up's transaction, the
// sign-in limit's dates compared by the database, the hash a deleted user
// leaves, a reset's token and hourly counts, and requests that race.
import { expect, it, vi } from 'vitest'
import type { Email } from './index.ts'
import { PublicError } from 'ultimabase'
import {
	hourly,
	limited,
	PasswordAttempt,
	PasswordHash,
	PasswordRequest,
} from './models.ts'
import {
	graphqlOf,
	M,
	signInQuery,
	signUpQuery,
	started,
	User,
	tokenIn,
} from './test/app.ts'
import { database, urls } from './test/postgres.ts'
import { PasswordToken } from './tokens.ts'

const ada = { email: 'ada@example.com', password: 'correct horse' }
const failed = (body: unknown): unknown =>
	JSON.stringify(body).includes('INVALID_CREDENTIALS')
// Each check runs while the others are counted, as a hash would.
const mistyped = async () => {
	await new Promise((resolve) => setTimeout(resolve, 50))
	throw new PublicError('INVALID_CREDENTIALS', 'Wrong password.')
}

for (const url of urls) {
	it(`signs up, limits and signs in on ${new URL(url).host}`, async () => {
		const running = await started(undefined, database(url))
		try {
			const signUp = { input: { ...ada, name: 'Ada' } }
			expect((await graphqlOf(running.url, signUpQuery, signUp)).status).toBe(
				200,
			)
			// A taken email rolls the user back.
			const again = await graphqlOf(running.url, signUpQuery, signUp)
			expect(JSON.stringify(again.body)).toContain('UNIQUE_VIOLATION')
			expect(await User.count({}, M)).toBe(1)

			const now = Date.now()
			vi.spyOn(Date, 'now').mockReturnValue(now)
			const wrong = { input: { ...ada, password: 'wrong password' } }
			for (let failure = 0; failure < 10; failure += 1) {
				const refused = await graphqlOf(running.url, signInQuery, wrong)
				expect(failed(refused.body)).toBe(true)
			}
			const blocked = await graphqlOf(running.url, signInQuery, { input: ada })
			expect(JSON.stringify(blocked.body)).toContain('"retryAfter":900')
			vi.spyOn(Date, 'now').mockReturnValue(now + 15 * 60 * 1000)
			const signed = await graphqlOf(running.url, signInQuery, { input: ada })
			expect(JSON.stringify(signed.body)).toContain('"name":"Ada"')
			expect(await PasswordAttempt.count({}, M)).toBe(0)

			await User.deleteMany({ where: {} }, M)
			expect(await PasswordHash.count({}, M)).toBe(0)
		} finally {
			vi.restoreAllMocks()
			await running.app.stop()
		}
	})

	it(`resets a password on ${new URL(url).host}`, async () => {
		const outbox: Email[] = []
		const sendEmail = async (email: Email) => {
			outbox.push(email)
		}
		const running = await started(
			{ signUp: ['name'], sendEmail },
			database(url),
		)
		try {
			const signUp = { input: { ...ada, name: 'Ada' } }
			await graphqlOf(running.url, signUpQuery, signUp)
			const now = Date.now()
			vi.spyOn(Date, 'now').mockReturnValue(now)
			const request = async () =>
				graphqlOf(
					running.url,
					'mutation ($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }',
					{ input: { email: ada.email } },
				)
			for (let index = 0; index < 4; index += 1) await request()
			await vi.waitFor(async () => {
				expect(outbox).toHaveLength(3)
				expect(
					await PasswordRequest.count({ where: { kind: 'email' } }, M),
				).toBe(3)
			})
			// Sign-up's verification email counts among the three.
			expect(await PasswordToken.count({}, M)).toBe(2)
			const reset = async (token: string) =>
				graphqlOf(
					running.url,
					'mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }',
					{ input: { token, password: 'new secret!' } },
				)
			// The token's expiry is compared once read.
			vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000 - 1)
			const token = tokenIn(outbox.findLast(({ kind }) => kind === 'reset'))
			expect((await reset(token)).body).toEqual({
				data: { resetPassword: true },
			})
			expect(failed((await reset(token)).body)).toBe(true)
			const input = { input: { ...ada, password: 'new secret!' } }
			const signed = await graphqlOf(running.url, signInQuery, input)
			expect(JSON.stringify(signed.body)).toContain('"name":"Ada"')
			const user = await User.findFirst({}, M)
			expect(user?.emailVerified).toBe(true)
			// The account is told once the reset commits, past the three.
			await vi.waitFor(() => {
				expect(outbox.at(-1)).toEqual({
					kind: 'passwordChanged',
					to: ada.email,
					userId: user?.id,
				})
			})
			// Past one hour, the counts are purged and another email goes.
			vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000)
			await request()
			await vi.waitFor(() => {
				expect(outbox).toHaveLength(5)
			})
			expect(await PasswordRequest.count({ where: { kind: 'email' } }, M)).toBe(
				1,
			)
		} finally {
			vi.restoreAllMocks()
			await running.app.stop()
		}
	})

	it(`lets no more than ten failed sign-ins through at once on ${new URL(url).host}`, async () => {
		const running = await started(undefined, database(url))
		try {
			const attempt = { subject: 'ada', address: '192.0.2.1' }
			const outcomes = await Promise.all(
				Array.from({ length: 30 }, async () =>
					limited(attempt, mistyped).catch((error: unknown) =>
						error instanceof PublicError ? error.code : error,
					),
				),
			)
			const checked = outcomes.filter((code) => code === 'INVALID_CREDENTIALS')
			expect(checked.length).toBeLessThanOrEqual(10)
			expect(await PasswordAttempt.count({}, M)).toBe(checked.length)
		} finally {
			await running.app.stop()
		}
	})

	it(`lets no more than three emails through at once on ${new URL(url).host}`, async () => {
		const running = await started(undefined, database(url))
		try {
			const asked = Array.from({ length: 10 }, async () =>
				hourly('email', 'ada', 3),
			)
			const allowed = (await Promise.all(asked)).filter((refused) => !refused)
			expect(allowed.length).toBeLessThanOrEqual(3)
			const where = { kind: 'email', subject: 'ada' }
			expect(await PasswordRequest.count({ where }, M)).toBe(allowed.length)
		} finally {
			await running.app.stop()
		}
	})
}
