import type { Pool, PoolClient } from 'pg'
import { expectTypeOf, test } from 'vitest'

import {
	createPostgresDrizzleClient,
	type PostgresDrizzleClient,
	type PostgresDriverQueryClient,
} from './client.js'

declare const pool: Pool
declare const transactionClient: PoolClient

test('accepts regular and transaction-scoped node-postgres clients', () => {
	expectTypeOf<Pool>().toExtend<PostgresDriverQueryClient>()
	expectTypeOf<PoolClient>().toExtend<PostgresDriverQueryClient>()
	expectTypeOf(
		createPostgresDrizzleClient(pool),
	).toEqualTypeOf<PostgresDrizzleClient>()
	expectTypeOf(
		createPostgresDrizzleClient(transactionClient),
	).toEqualTypeOf<PostgresDrizzleClient>()
})
