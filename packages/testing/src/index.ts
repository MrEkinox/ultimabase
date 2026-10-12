// Application entry (ADR-0327): test the production application itself.
// Plugin conformance lives in `@ultimabase/testing/plugins`, the Vitest
// configuration in `@ultimabase/testing/vitest`.
export {
	testApplication,
	type TestApplication,
} from './application/test-application.js'
