import { expectTypeOf, test } from 'vitest'

import {
	PostgresTestWorker,
	readVitestPoolId,
	type PostgresTestQuery,
	type PostgresTestWorkerOptions,
} from './worker.js'

test('types PostgreSQL worker isolation without a concrete driver', () => {
	const query = ((statement) =>
		Promise.resolve(statement)) satisfies PostgresTestQuery
	const options = {
		prefix: 'typed_suite',
		query,
		workerId: readVitestPoolId('3'),
	} satisfies PostgresTestWorkerOptions
	const worker = new PostgresTestWorker(options)

	expectTypeOf(worker.schemaName).toEqualTypeOf<string>()
	expectTypeOf(worker.connectionOptions).toEqualTypeOf<string>()
	expectTypeOf(worker.reset()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(worker.dispose()).toEqualTypeOf<Promise<void>>()
})
