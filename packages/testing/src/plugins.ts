// Plugin-author entry (ADR-0327): conformance suites and the lower-level
// helpers of tests that build their own applications. Applications use
// `testApplication` from `@ultimabase/testing`.
export { PostgresTestWorker } from './postgres/worker.js'
export type {
	PostgresTestQuery,
	PostgresTestWorkerOptions,
} from './postgres/worker.js'
export { FakePublicOperationTransport } from './operations/fake-public-transport.js'
export type { FakeOperationTransportResponse } from './operations/fake-public-transport.js'
export {
	createPluginConformanceFixture,
	type CreatePluginConformanceFixtureOptions,
	type PluginConformanceFixture,
	type PluginConformanceUltimaBaseFixture,
} from './plugins/fixture.js'
export {
	definePluginConformanceSuite,
	PluginConformanceSuite,
	type DefinePluginConformanceSuiteOptions,
	type PluginConformanceContext,
	type PluginConformanceInstanceFactory,
	type PluginConformanceVerifier,
} from './plugins/suite.js'
export { runPluginConformance } from './plugins/runner.js'
export {
	PluginConformanceError,
	type OptionalPluginConformanceContract,
	type PluginConformanceCheckResult,
	type PluginConformanceContract,
	type PluginConformanceExpected,
	type PluginConformanceReport,
} from './plugins/contracts.js'
// TEMPORARY: leaves with Typegen in migration step 6.8 (ADR-0327 decision 4).
export {
	withPluginTypegenConformance,
	type PluginTypegenConformanceOptions,
} from './plugins/typegen-check.js'
export { waitForAfterCommit } from './after-commit/wait.js'
export {
	createCapturingLogger,
	type CapturedLogLine,
	type CapturingLogger,
} from './logging/capturing-logger.js'
