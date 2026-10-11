# @ultimabase/testing

Testing utilities and conformance suites for framework applications and plugin authors.

## Application suites

Use the existing application lifecycle with your runner's suite hooks. For an
existing `app` instance owned by the suite:

```ts
import { afterAll, beforeAll, it } from 'vitest'
beforeAll(() => app.start())
afterAll(() => app.dispose())

it('executes application behavior', async () => {
	// Create independent records and assert behavior through this application's API.
})
```

For Jest, import these hooks from `@jest/globals`. Always return or await the
lifecycle promises. Core permits one initialized application per JavaScript
realm, so tests requiring a replacement must await disposal first. Concurrent
requests in one application and applications in separate workers remain
supported. An injected database pool belongs to the test: close it after
application disposal, then remove its worker schema. See the website's
[Test an Application](../../apps/website/content/docs/1.0.0/guides/test-an-application.mdx)
for the complete PostgreSQL example. There is no test-only activation bypass.

For an application owned by one asynchronous test, prefer its native resource
scope instead of a manual trailing cleanup:

```ts
it('executes one isolated application', async () => {
	const Application = UltimaBase.use(databasePlugin())
	await using app = new Application({ schemas })
	await app.start()
	// The application is disposed on success and on failure.
})
```

## Plugin conformance

`definePluginConformanceSuite()` keeps the exact subject, support-plugin, and
schema tuples inferred from a fresh fixture. `runPluginConformance()` is
runner-agnostic: use it from Vitest, another test runner, or a plain JavaScript
script. The runner installs each fresh fixture through Core's
`UltimaBase.use()` installation path, not the removed constructor `plugins` option or a
test-only registry.

```ts
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: workflowPlugin(),
			schemas: [Post],
		}),
	expected: {
		pluginId: 'community.workflow',
		version: '1.0.0',
		core: '^1.0.0',
	},
})

it('conforms to the public kernel', async () => {
	const report = await runPluginConformance(withPluginTypegenConformance(suite))
	expect(report.checks.every(({ status }) => status === 'passed')).toBe(true)
})
```

The common suite always verifies the manifest, immutable capability contract,
static declaration determinism, public provenance, setup/application-capability
cleanup, rejection of competing activation, and isolation across sequential
application lifetimes. It additionally verifies:

- two explicit instances when `instances` supplies a factory and distinct IDs;
- cumulative denial when the subject requests Core privileges;
- environmental-claim denial when the subject reports direct Node.js behavior.

Expected privileges and environmental claims can be listed in `expected` when
their exact order is part of the package contract. The harness never requests a
privilege for the plugin, changes its manifest, reads private Core state, or
opens PostgreSQL for a logical-only fixture. It silences the normal startup
logger inside its own applications while still exercising the public policy
report and denial behavior.

For source-typed fields or options, create the subject and its schemas together
inside `createFixture`: define the schema through the same ordered
`UltimaBase.use(support).use(subject).Schema.define(...)` chain used by the
fixture (omit `.use(support)` when none is required), then pass the subject and
schema to `createPluginConformanceFixture`. Test the same fixture against
package-root exports for packed editor behavior. Typegen conformance still
checks the retained named-schema graph, not local plugin projections.

Official plugins list `expected.environment` even when it is `[]`. This makes a
deliberate absence of direct filesystem, network, process, and native-code
behavior as testable as a declared claim.

### Explicit instances and dependencies

Support plugins are ordinary public definitions and precede the subject in the
application graph. They make named dependencies and capability requirements
visible instead of introducing a test-only bypass:

```ts
const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: auditPlugin({ instanceId: 'default' }),
			supportPlugins: [storagePlugin()],
			schemas: [],
		}),
	expected: {
		pluginId: 'community.audit',
		version: '1.0.0',
		core: '^1.0.0',
	},
	instances: {
		instanceIds: ['primary', 'archive'],
		create: (instanceId) => auditPlugin({ instanceId }),
	},
})
```

### Optional domain checks

Use immutable `.check(contract, verifier)` calls for behavior specific to the
plugin. Every verifier gets a fresh application built through public Core
factories; every created value is disposed automatically, including
after a failed assertion.

```ts
const completeSuite = suite
	.check('operation', async (context) => {
		const { ultimabase } = context.createUltimaBase()
		await ultimabase.start()
		const result = await ultimabase.operation(runWorkflow).execute(input)
		expect(result).toStrictEqual(expectedResult)
	})
	.check('schema-surface', (context) => {
		const { ultimabase } = context.createUltimaBase()
		expect(
			ultimabase
				.compile()
				.typegenGraph.schemaSurfaces.some(
					({ schema }) => schema.className === 'Post',
				),
		).toBe(true)
	})
	.check('middleware', async (context) => {
		// Execute a request and assert the contributed interceptor/observer trace.
	})
	.check('persistence', async (context) => {
		// Capture the public adapter request and assert the rewritten physical plan.
	})
```

The optional contract names are `typegen`, `javascript-operation`, `operation`,
`relation-read`, `schema-mutation`, `schema-surface`, `transport`, `middleware`,
`persistence`, `codec`, `migration`, and `adapter-failure`. A `relation-read`
verifier should execute a relation filter or include and assert the portable
relation predicate and declared row filter without selecting a database or
policy product. A `schema-mutation` verifier should
execute one neutral application-owned schema command and assert
its logical identity and physical effect without installing Access, Hooks, or a
product plugin. This keeps the report precise while leaving each
plugin-specific assertion readable. `withPluginTypegenConformance()` implements
the generic `typegen` check and compares two complete generated outputs before
running an optional package-specific assertion.

For JavaScript, import the same helpers and select `javascript-operation`; no
generated declarations or Typegen import is required. Transport checks can use
`FakePublicOperationTransport`; adapter checks can deliberately install a
failing public capability provider. The existing `migration` check label is
only a category for a plugin's own verifier, not a bundled migration planner.
These helpers remain opt-in, so the common suite has no database or transport
dependency.

`PluginConformanceError` exposes `pluginId`, the exact failed `contract`, and
the original error as `cause`. A report contains only completed checks and
retains no application, plugin resource, or mutable registry.

Product protocols keep their behavior fixtures in their own package or public
E2E tests. For example, an official-compatible Hooks provider can install
`hooksPlugin()` as a support plugin and attach a `middleware` check, while an
official-compatible Access provider can install `accessPlugin()` and attach a
`persistence` check. Both use only package-root exports and the generic context
above; `@ultimabase/testing` does not import either product. An independent
lifecycle or policy engine runs the common kernel suite and its own optional
checks without implementing the official Hooks or Access vocabulary.

## PostgreSQL worker isolation

`PostgresTestWorker` gives every Vitest fork a deterministic PostgreSQL schema
without depending on `pg` or Testcontainers:

```ts
import process from 'node:process'

import { PostgresTestWorker, readVitestPoolId } from '@ultimabase/testing'
import { Pool } from 'pg'

const adminPool = new Pool({ connectionString: databaseUrl })
const worker = new PostgresTestWorker({
	query: async (statement) => {
		await adminPool.query(statement)
	},
	workerId: readVitestPoolId(process.env.VITEST_POOL_ID),
})

await worker.reset()

const pool = new Pool({
	connectionString: databaseUrl,
	options: worker.connectionOptions,
})
```

`reset()` drops and recreates only `worker.schemaName`. `connectionOptions`
sets that schema as the pool's `search_path`. Close the worker pool before
calling `worker.dispose()`, then close the administrative pool.
`PostgresTestWorker` also implements `AsyncDisposable`, so a worker owned by one
test can use `await using worker = new PostgresTestWorker(...)`. Close every
pool that uses its schema before leaving that scope. Suite-level fixtures that
span hooks should retain explicit ordered teardown.

The repository's PostgreSQL E2E project starts one Testcontainer globally and
shares only its connection URI. No mutable application, pool, container,
schema registry, or plugin instance is shared between Vitest workers.

The official Hooks PostgreSQL scenario uses this boundary to verify nested writes,
rollback, post-commit delivery, protected scope row filters, field restrictions,
and atomic item-oriented collection behavior through built public package
exports.

## Capturing logger

`createCapturingLogger()` returns an application logger (ADR-0313) that
records lines instead of printing them, for `new App({ logger })`:

```ts
import { createCapturingLogger } from '@ultimabase/testing'

const logger = createCapturingLogger()
const app = new App({ schemas: [Todo], logger, logLevel: 'debug' })
await app.start()

expect(logger.messages('warn')).toEqual([])
expect(logger.lines.at(-1)?.message).toMatch(/^UltimaBase started:/u)
```

`lines` keeps every `{ level, message, details }` record in arrival order,
`messages(level?)` lists messages, and `clear()` forgets them.

## Fake public operation transport

`FakePublicOperationTransport` exercises an application's explicit generic
operation exposure without installing HTTP or GraphQL. It returns only encoded
success values, safe `FrameworkError` payloads, or declared public
`PluginError` payloads; unknown diagnostics collapse to `INTERNAL_ERROR`.
The fake does not acknowledge transport protection automatically. Its exposure
therefore emits Core's product-neutral
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` warning unless the fixture sets
`acknowledgeUnverifiedProtection: true`; installing a policy provider alone does
not silence that diagnostic.

Requests may carry either an anonymous context or an application-verified
Master context. The fake forwards that real context unchanged; Core still
rejects foreign, forged, stale, and wrong-authority Master contexts before the
operation codec or handler runs. The fake never parses credentials or creates
authority from wire-shaped input.

## Retired migration testing helper

ADR-0266 removes `FakeAdapterMigrationHistory` and its `snapshots`, `plan` and
`accept` surfaces together with Core's migration-only planner. Tests can still
run real database checks; there is no replacement planning helper. The generic `migration`
conformance category remains available for an explicit plugin-owned verifier.
