// A token redeemed while another transaction uses it: the delete that waits
// on the token's lock finds it gone, and the link fails (D-117).
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { expect, it } from 'vitest'
import { started } from './test/app.ts'
import { database, urls } from './test/postgres.ts'
import { issueToken, redeemToken } from './tokens.ts'

/** The schema whose token table holds `userId`'s token. */
async function schemaOf(client: Client, userId: string): Promise<string> {
	const { rows } = await client.query<{ schema: string }>(
		`select table_schema as schema from information_schema.tables
		 where table_name = 'password_token'`,
	)
	for (const { schema } of rows) {
		const found = await client.query(
			`select 1 from "${schema}"."password_token" where "user_id" = $1`,
			[userId],
		)
		if (found.rowCount === 1) return schema
	}
	throw new Error('No token table holds the token.')
}

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
		const running = await started(undefined, database(url))
		const other = new Client({ connectionString: url })
		const watcher = new Client({ connectionString: url })
		await other.connect()
		await watcher.connect()
		try {
			const userId = randomUUID()
			const token = await issueToken(userId, 'reset')
			const schema = await schemaOf(other, userId)
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
