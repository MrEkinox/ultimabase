import { sql } from 'drizzle-orm/sql'
import { describe, expect, it } from 'vitest'

import {
	createPostgresDrizzleClient,
	type PostgresDriverQueryClient,
} from './client.js'

interface FixtureQueryResult {
	readonly command: string
	readonly fields: readonly unknown[]
	readonly oid: number
	readonly rowCount: number
	readonly rows: readonly { readonly value: number }[]
}

/** Behaves like the query surface used by Drizzle while retaining every call. */
class FixtureQueryClient implements PostgresDriverQueryClient {
	readonly calls: unknown[][] = []

	query(...arguments_: never[]): Promise<FixtureQueryResult> {
		this.calls.push(arguments_)

		return Promise.resolve({
			command: 'SELECT',
			fields: [],
			oid: 0,
			rowCount: 1,
			rows: [{ value: 1 }],
		})
	}
}

describe('internal Drizzle client', () => {
	it('executes a parameterized query through a compatible driver client', async () => {
		const driverClient = new FixtureQueryClient()
		const client = createPostgresDrizzleClient(driverClient)
		const result = await client.execute<{ readonly value: number }>(
			sql`select ${1}::integer as value`,
		)

		expect(result.rows).toStrictEqual([{ value: 1 }])
		expect(driverClient.calls).toHaveLength(1)
		expect(driverClient.calls[0]?.[0]).toMatchObject({
			text: 'select $1::integer as value',
		})
		expect(driverClient.calls[0]?.[1]).toStrictEqual([1])
	})
})
