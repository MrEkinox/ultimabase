import * as testing from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/testing public API', () => {
	it('exports only implemented testing and conformance values', () => {
		expect(Object.keys(testing).sort()).toStrictEqual([
			'FakeAdapterMigrationHistory',
			'FakePublicOperationTransport',
			'PluginConformanceError',
			'PluginConformanceSuite',
			'PostgresTestWorker',
			'RuntimeCostProbe',
			'assertNoOptionalRuntimeCost',
			'createPluginConformanceFixture',
			'definePluginConformanceSuite',
			'diffRuntimeCostSnapshots',
			'readVitestPoolId',
			'runPluginConformance',
			'withPluginTypegenConformance',
		])
	})
})
