import * as testing from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/testing public API', () => {
	it('exports only implemented testing and conformance values', () => {
		expect(Object.keys(testing).sort()).toStrictEqual([
			'FakePublicOperationTransport',
			'PluginConformanceError',
			'PluginConformanceSuite',
			'PostgresTestWorker',
			'createCapturingLogger',
			'createPluginConformanceFixture',
			'definePluginConformanceSuite',
			'readVitestPoolId',
			'runPluginConformance',
			'withPluginTypegenConformance',
		])
	})
})
