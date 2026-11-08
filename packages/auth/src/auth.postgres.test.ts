// Sessions on PostgreSQL (D-110, D-112): auth's own table, its dates compared
// by the database, the sessions a deleted user leaves, and the kept callers
// another server's writes reach through the feed (D-332).
import { expect, it, vi } from 'vitest'
import { AuthSession } from './sessions.ts'
import { bearer, callerOf, day, M, signIn, started, User } from './test/app.ts'
import { database, urls } from './test/postgres.ts'

for (const url of urls) {
	it(`keeps, renews and ends sessions on ${new URL(url).host}`, async () => {
		const running = await started(database(url))
		try {
			const { ada } = running
			const { token } = await signIn(running.url, ada.id)
			const signedIn = await callerOf(running.url, bearer(token))
			expect(signedIn.body).toMatchObject({ user: { id: ada.id } })

			const now = Date.now()
			vi.spyOn(Date, 'now').mockReturnValue(now + 20 * day)
			expect((await callerOf(running.url, bearer(token))).status).toBe(200)
			const [renewed] = await AuthSession.findMany({}, M)
			expect(renewed?.expiresAt.getTime()).toBe(now + 50 * day)

			// Signing in past the end deletes the expired session.
			vi.spyOn(Date, 'now').mockReturnValue(now + 51 * day)
			const next = await signIn(running.url, ada.id)
			expect(await AuthSession.count({}, M)).toBe(1)
			expect((await callerOf(running.url, bearer(token))).status).toBe(401)

			await signIn(running.url, ada.id)
			await User.delete({ where: { id: ada.id } }, M)
			expect(await AuthSession.count({}, M)).toBe(0)
			expect((await callerOf(running.url, bearer(next.token))).status).toBe(401)
		} finally {
			vi.restoreAllMocks()
			await running.app.stop()
		}
	})

	it(`gives up a kept caller another server changed on ${new URL(url).host}`, async () => {
		const running = await started(database(url))
		try {
			const { ada } = running
			const { token } = await signIn(running.url, ada.id)
			expect((await callerOf(running.url, bearer(token))).status).toBe(200)
			// Written as another server writes: only the feed tells this one.
			await User.update(
				{ where: { id: ada.id }, data: { email: 'ada@lovelace.dev' } },
				M,
			)
			await vi.waitFor(async () =>
				expect((await callerOf(running.url, bearer(token))).body).toMatchObject(
					{ user: { email: 'ada@lovelace.dev' } },
				),
			)
			await AuthSession.deleteMany({ where: { userId: ada.id } }, M)
			await vi.waitFor(async () =>
				expect((await callerOf(running.url, bearer(token))).status).toBe(401),
			)
		} finally {
			await running.app.stop()
		}
	})
}
