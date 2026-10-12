import * as testing from '../src/index.js'
import * as plugins from '../src/plugins.js'
import * as vitest from '../src/vitest.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/testing public API', () => {
	it('exports testApplication alone for applications (ADR-0327)', () => {
		expect(Object.keys(testing).sort()).toStrictEqual(['testApplication'])
	})

	it('exports conformance and lower-level helpers for plugin authors', () => {
		expect(Object.keys(plugins).sort()).toStrictEqual([
			'FakePublicOperationTransport',
			'PluginConformanceError',
			'PluginConformanceSuite',
			'PostgresTestWorker',
			'createCapturingLogger',
			'createPluginConformanceFixture',
			'definePluginConformanceSuite',
			'runPluginConformance',
			'waitForAfterCommit',
		])
	})

	it('exports the Vitest configuration helper', () => {
		expect(Object.keys(vitest).sort()).toStrictEqual(['ultimabaseTesting'])
	})
})
