// Tokens at once (D-117): one redeemed while another transaction uses it
// fails, and of those issued at once one stays.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { expect, it } from 'vitest'
import { M, started } from './test/app.ts'
import { database, urls } from './test/postgres.ts'
import { issueToken, PasswordToken, redeemToken } from './tokens.ts'

async function waitingOnLock(watcher: Client): Promise<void> {
	for (let tries = 0; tries < 300; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike '%"password_token"%'`,
		)
		if ((rows[0]?.n ?? 0) > 0) return
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('The redeem never waited on the token lock.')
}

for (const url of urls) {
	it(`refuses a token another transaction used meanwhile on ${new URL(url).host}`, async () => {
		// Its own schema: another file's may be dropped while it runs.
		const schema = `t_${randomUUID().replaceAll('-', '')}`
		const running = await started(undefined, database(url, schema))
		const other = new Client({ connectionString: url })
		const watcher = new Client({ connectionString: url })
		await other.connect()
		await watcher.connect()
		try {
			const userId = randomUUID()
			const token = await issueToken(userId, 'reset', 'ada@example.com')
			await other.query('begin')
			await other.query(
				`delete from "${schema}"."password_token" where "user_id" = $1`,
				[userId],
			)
			const pending = redeemToken(token, 'reset').catch(
				(error: unknown) => error,
			)
			await waitingOnLock(watcher)
			await other.query('commit')
			expect(await pending).toMatchObject({ code: 'INVALID_CREDENTIALS' })
		} finally {
			await other.end()
			await watcher.end()
			await running.app.stop()
		}
	})
}

for (const url of urls) {
	it(`keeps one token of those issued at once on ${new URL(url).host}`, async () => {
		const schema = `t_${randomUUID().replaceAll('-', '')}`
		const running = await started(undefined, database(url, schema))
		try {
			const userId = randomUUID()
			await Promise.all(
				Array.from({ length: 5 }, async () =>
					issueToken(userId, 'reset', 'ada@example.com'),
				),
			)
			expect(await PasswordToken.count({ where: { userId } }, M)).toBe(1)
		} finally {
			await running.app.stop()
		}
	})
}
