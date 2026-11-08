// The statements a connection deallocates, as a pooler in transaction mode
// sees them: it renames the statements, so their deallocate fails. It never
// runs within a transaction, where its failure would undo the transaction, and
// a name the server does not know is not tried again.
import { setImmediate as settled } from 'node:timers/promises'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { prepare, preparedStatements, preparing } from './prepared.ts'

/**
 * A connection that records what it is sent, its deallocates answered with
 * `code` when one is given.
 */
function connection(code?: string): {
	client: Client
	sent: string[]
} {
	const client = new Client()
	const sent: string[] = []
	const parsed: unknown = Reflect.get(
		Object(Reflect.get(client, 'connection')),
		'parsedStatements',
	)
	Reflect.set(client, 'query', async (config: unknown): Promise<unknown> => {
		if (typeof config === 'string') {
			sent.push(config)
			if (code !== undefined && config.startsWith('deallocate'))
				throw Object.assign(new Error(config), { code })
			return {}
		}
		const name: unknown = Reflect.get(Object(config), 'name')
		Reflect.set(Object(parsed), String(name), '')
		sent.push(`run ${String(name)}`)
		return {}
	})
	preparing(client)
	return { client, sent }
}

/** Has `client` run prepared one more shape than it keeps. */
async function overflow(client: Client): Promise<void> {
	for (let at = 0; at <= preparedStatements; at += 1) {
		const text = `select ${at} as "overflow"`
		prepare(text, 0)
		prepare(text, 0)
		await client.query(text, [])
	}
}

describe('a dropped statement', () => {
	it('is deallocated after the COMMIT, never within the transaction', async () => {
		const { client, sent } = connection()
		await client.query('begin')
		await overflow(client)
		expect(sent).not.toContain('deallocate ultimabase_0')
		await client.query('commit')
		expect(sent.slice(-2)).toStrictEqual(['commit', 'deallocate ultimabase_0'])
	})

	it('waits for a ROLLBACK, not for a savepoint undone', async () => {
		const { client, sent } = connection()
		await client.query('start transaction isolation level serializable')
		await overflow(client)
		await client.query('rollback to "sp"')
		expect(sent).not.toContain('deallocate ultimabase_0')
		await client.query('rollback')
		expect(sent.at(-1)).toBe('deallocate ultimabase_0')
	})

	it('is not tried again when the server does not know its name', async () => {
		const { client, sent } = connection('26000')
		await overflow(client)
		await settled()
		await client.query('select 1')
		const tries = sent.filter((text) => text === 'deallocate ultimabase_0')
		expect(tries).toHaveLength(1)
	})

	it('is tried again when the server refused it otherwise', async () => {
		const { client, sent } = connection('25P02')
		await overflow(client)
		await settled()
		await client.query('select 1')
		const tries = sent.filter((text) => text === 'deallocate ultimabase_0')
		expect(tries).toHaveLength(2)
	})
})
