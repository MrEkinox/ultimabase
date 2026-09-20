# @ultimabase/testing

Testing utilities and conformance suites for framework applications and plugin authors.

## Plugin conformance

`definePluginConformanceSuite()` keeps the exact subject, support-plugin, and
schema tuples inferred from a fresh fixture. `runPluginConformance()` is
runner-agnostic: use it from Vitest, another test runner, or a plain JavaScript
script.

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
cleanup, and isolation between two applications. It additionally verifies:

- two explicit instances when `instances` supplies a factory and distinct IDs;
- cumulative denial when the subject requests Core privileges;
- environmental-claim denial when the subject reports direct Node.js behavior.

Expected privileges and environmental claims can be listed in `expected` when
their exact order is part of the package contract. The harness never requests a
privilege for the plugin, changes its manifest, reads private Core state, or
opens PostgreSQL for a logical-only fixture. It silences the normal startup
logger inside its own applications while still exercising the public policy
report and denial behavior.

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
plugin. Every verifier gets fresh public `FrameworkApplication` and
`UltimaBase` factories; every created value is disposed automatically, including
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
		const { application } = context.createApplication()
		expect(application.getSchemaSurface('Post')).toBeDefined()
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
verifier should execute a persisted model's relation handle and assert the
portable private relation scope and declared row filter without selecting a
database or policy product. A `schema-mutation` verifier should
execute one neutral application-owned schema or bound-model command and assert
its logical identity and physical effect without installing Access, Hooks, or a
product plugin. This keeps the report precise while leaving each
plugin-specific assertion readable. `withPluginTypegenConformance()` implements
the generic `typegen` check and compares two complete generated outputs before
running an optional package-specific assertion.

For JavaScript, import the same helpers and select `javascript-operation`; no
generated declarations or Typegen import is required. Transport checks can use
`FakePublicOperationTransport`. Migration checks can use
`FakeAdapterMigrationHistory` to cover upgrades and orphaned contributions;
adapter checks can deliberately install a failing public capability provider.
Those fakes remain opt-in, so the common suite has no database or transport
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

The repository's PostgreSQL E2E project starts one Testcontainer globally and
shares only its connection URI. No mutable application, pool, container,
schema registry, or plugin instance is shared between Vitest workers.

The official Hooks PostgreSQL scenario uses this boundary to verify nested writes,
rollback, post-commit delivery, opaque scope constraints, field restrictions,
and atomic item-oriented collection behavior through built public package
exports.

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

## Fake adapter migration history

`FakeAdapterMigrationHistory` retains one immutable set of attributed adapter
contribution snapshots. `plan(current, intents)` uses Core's real migration
planner, including explicit upgrade requirements and inert orphan reporting;
`accept(current)` returns a new history so tests do not share mutable state:

```ts
const previous = new FakeAdapterMigrationHistory(previousSnapshots)
const plan = previous.plan(currentSnapshots, upgradeIntents)

expect(plan.orphaned).toHaveLength(1)
const next = previous.accept(currentSnapshots)
```

This fake contains no database driver, DDL renderer, or automatic destructive
synchronization behavior.
