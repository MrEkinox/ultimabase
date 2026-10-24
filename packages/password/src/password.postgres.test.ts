// password on PostgreSQL (D-110, D-113): sign-up's transaction, the sign-in
// limit's dates compared by the database, and the hash a deleted user leaves.
import { expect, it, vi } from 'vitest'
import { PasswordAttempt, PasswordHash } from './models.ts'
import {
	graphqlOf,
	M,
	signInQuery,
	signUpQuery,
	started,
	User,
} from './test/app.ts'
import { database, urls } from './test/postgres.ts'

const ada = { email: 'ada@example.com', password: 'correct horse' }
const failed = (body: unknown): unknown =>
	JSON.stringify(body).includes('INVALID_CREDENTIALS')

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
			const limited = await graphqlOf(running.url, signInQuery, { input: ada })
			expect(JSON.stringify(limited.body)).toContain('"retryAfter":900')
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
}
