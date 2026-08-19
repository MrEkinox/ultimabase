import * as testing from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/testing public API', () => {
	it('exports only implemented worker-isolation values', () => {
		expect(Object.keys(testing).sort()).toStrictEqual([
			'FakePublicOperationTransport',
			'PostgresTestWorker',
			'readVitestPoolId',
		])
	})
})
