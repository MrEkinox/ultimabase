# @ultimabase/testing

Testing utilities for applications and conformance suites for plugin authors.

Applications import `@ultimabase/testing`; plugin authors import
`@ultimabase/testing/plugins`; the Vitest configuration comes from
`@ultimabase/testing/vitest` (ADR-0327).

## Test an application: `testApplication`

`testApplication(ultimabase)` starts the production application itself (same
plugins, same rules) on the test worker's own PostgreSQL schema. Leaving the
`await using` scope closes the handle. From the
[plugin authoring example](../../examples/plugin-authoring/README.md):

<!-- region ../../examples/plugin-authoring/tests/first.test.ts#first-test -->

```ts
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('creates a Post', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Ship' } })
	expect(post.archivedAt).toBeNull()
	await t.afterCommit()
})
```

<!-- endregion -->

- **Database.** The connection comes from `TEST_DATABASE_URL`, otherwise
  from a PostgreSQL container (Testcontainers, Docker required) started once.
  Each worker uses its own schema, `ultimabase_test_<worker>`, dropped and
  recreated when the application starts. `testApplication` gives the schema
  to `postgresPlugin()` through `DATABASE_URL`, only while the application
  starts, and refuses an application that did not connect through it (an
  explicit `url` or `pool` option): it never empties another database.
- **One application per file.** An application does not restart after
  `dispose()`, so a later call with the same application reuses it, after
  emptying its tables: every test starts from no data. The application stops
  after the test file (`ultimabaseTesting()` registers it) and its schema is
  dropped. Tests sharing an application run one after another.
- **Production.** `testApplication` refuses `NODE_ENV=production`.

The handle `t` provides:

| Member                           | Effect                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t.reset()`                      | Empties every table the database plugin manages (`TRUNCATE`, identities restarted), keeping the tables, then reruns the plugins' `ready` seeding, such as Roles `ensure`. The adapter capability is neutral; PostgreSQL implements it. |
| `t.fetch(path, init?, options?)` | Sends one in-memory request through the HTTP plugin, without a port, as a client would: authentication comes from its headers, and the request comes from the local peer `127.0.0.1`.                                                  |
| `t.as(principal, fn)`            | Runs `fn` as `principal` (a pointer such as `User.pointer(id)`, or `undefined` for anonymous): rules and hooks see that principal.                                                                                                     |
| `t.asMaster(fn)`                 | Runs `fn` with Master authority without a configured key; Master bypasses authorization, never validation or hooks.                                                                                                                    |
| `t.afterCommit()`                | Resolves once pending after-commit work (`afterCommit` hooks, event consumers) has run, including the work it started.                                                                                                                 |

The plugin authoring example seeds with Master authority, reads over HTTP and
empties the tables:

<!-- region ../../examples/plugin-authoring/tests/test-application.test.ts#handle,reset -->

```ts
const post = await t.asMaster(() =>
	Post.createOne({ data: { title: 'Seeded' } }),
)
const response = await t.fetch('/api/classes/Post')
await t.afterCommit()

await t.reset()
```

<!-- endregion -->

The [Access example](../../examples/access/README.md) writes and reads as two
members, `asAda` being `Member.pointer(ada.id)`:

<!-- region ../../examples/access/tests/mutations.test.ts#write-note -->

```ts
const note = await t.as(asAda, () =>
	Note.createOne({ data: { author: ada.id, body: 'Call the printer' } }),
)
const mine = await t.as(asAda, () => Note.findMany())
const theirs = await t.as(Member.pointer(grace.id), () => Note.findMany())
```

<!-- endregion -->

`t.fetch` behaves like a local server: the HTTP plugin sees the socket peer
`127.0.0.1`, so rate limits and authentication record that address unless a
trusted `X-Forwarded-For` names another client. `t.fetch(path, init,
{ remoteAddress: '203.0.113.7' })` sends from another peer, and
`{ remoteAddress: undefined }` sends none, to test an unknown client address
as behind a fetch handler
([ADR-0334](../../docs/adr/0334-unknown-client-address.md)).

`t.as` and `t.asMaster` apply to the calls made inside `fn`. They exist only
on a handle: `testApplication` opens Core's application harness
(`openApplicationHarness` from `@ultimabase/core/plugin`) before the
application starts, and only that object grants Master without a key or
empties data. An application started with `ultimabase.start()` can never be
harnessed afterwards, and no option, environment variable or transport input
opens one. Each harness elevation is logged at `debug`.

## Vitest configuration

<!-- region ../../examples/plugin-authoring/vitest.config.ts#vitest-config -->

```ts
import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

// PostgreSQL from TEST_DATABASE_URL, or a container started once (Docker).
export default defineConfig({ test: { ...ultimabaseTesting() } })
```

<!-- endregion -->

`ultimabaseTesting()` returns a global setup that starts PostgreSQL once per
run unless `TEST_DATABASE_URL` is set, a setup file that stops each file's
application and drops its schema, `PORT=0` (a server plugin listens on a free
port, so workers never compete for the development port), the workers'
`--no-experimental-require-module` flag and 30-second test and hook timeouts.
The flag makes Node.js resolve packages with the same conditions as Vite: a
package shipping both ESM and CommonJS builds, such as `graphql`, then loads
once whether a test file or a dependency imports it, instead of failing with
`Cannot use GraphQLSchema from another module or realm`. Spread it first so
your own values win; merge your own `setupFiles`, `env` or `execArgv` with its
values.

With another runner, `testApplication` works the same way without the global
setup: without `TEST_DATABASE_URL` it starts one container per process. Call
`await ultimabase.dispose()` after the suite; the worker schema is recreated
at the next run.

## Plugin conformance

`definePluginConformanceSuite()` keeps the exact subject, support-plugin, and
schema tuples inferred from a fresh fixture. `runPluginConformance()` is
runner-agnostic: use it from Vitest, another test runner, or a plain JavaScript
script. The runner installs each fresh fixture through Core's
`UltimaBase.use()` installation path, not the removed constructor `plugins` option or a
test-only registry. The example's starter plugin is tested like this:

<!-- region ../../examples/plugin-authoring/tests/starter.test.ts#starter-test -->

```ts
import { UltimaBase } from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

// A package's own tests import its root export, as an application does.
import { starterPlugin } from '../src/starter-plugin.ts'

it('exposes setup only through its installed application', async () => {
	const Application = UltimaBase.use(starterPlugin())
	const application = await new Application({
		schemas: [],
	}).initialize()

	try {
		expect(application.plugin('community.starter')).toStrictEqual({
			ready: true,
		})
	} finally {
		await application.dispose()
	}
})

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({ subject: starterPlugin() }),
	expected: {
		core: '^0.0.0',
		pluginId: 'community.starter',
		version: '1.0.0',
	},
})

it('conforms to the public plugin kernel', async () => {
	// A failed contract throws a PluginConformanceError that names it.
	const report = await runPluginConformance(suite)
	expect(report.checks.map(({ contract }) => contract)).toContain('manifest')
})
```

<!-- endregion -->

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
package-root exports for packed editor behavior. This suite also adds the
optional `schema-surface` check described below:

<!-- region ../../examples/plugin-authoring/tests/conformance.test.ts#schema-suite -->

```ts
const suite = definePluginConformanceSuite({
	// The subject and the schemas that call its shape method, together.
	createFixture: () => {
		const subject = archivePlugin()
		const Post = UltimaBase.use(subject)
			.Schema.define({
				className: 'Post',
				fields: (f) => ({ title: f.string({ required: true }) }),
			})
			.archivable()
		return createPluginConformanceFixture({ subject, schemas: [Post] })
	},
	expected: {
		pluginId: '@example/archive-plugin',
		version: '0.0.0',
		core: '^0.0.0',
	},
}).check('schema-surface', (context) => {
	const { ultimabase } = context.createUltimaBase()
	const [surface] = ultimabase.compile().schemaSurfaces
	expect(surface?.schema.className).toBe('Post')
	expect([...(surface?.schemaMutations.keys() ?? [])]).toStrictEqual([
		'archiveOne',
		'archiveMany',
	])
})
```

<!-- endregion -->

Official plugins list `expected.environment` even when it is `[]`. This makes a
deliberate absence of direct filesystem, network, process, and native-code
behavior as testable as a declared claim.

### Explicit instances and dependencies

Support plugins are ordinary public definitions and precede the subject in the
application graph. They make named dependencies and capability requirements
visible instead of introducing a test-only bypass. `instances` checks two
explicit instances of one factory, and a support plugin provides the
capability a consumer requires:

<!-- region ../../examples/plugin-authoring/tests/conformance.test.ts#instances-suite -->

```ts
const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: starterPlugin('default'),
		}),
	expected: {
		pluginId: 'community.starter',
		version: '1.0.0',
		core: '^0.0.0',
	},
	instances: {
		instanceIds: ['primary', 'archive'],
		create: (instanceId) => starterPlugin(instanceId),
	},
})
```

<!-- endregion -->

<!-- region ../../examples/plugin-authoring/tests/conformance.test.ts#support-suite -->

```ts
const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: formatConsumer,
			supportPlugins: [formatProvider],
		}),
	expected: {
		pluginId: 'community.workflow-consumer',
		version: '1.0.0',
		core: '^0.0.0',
	},
})
```

<!-- endregion -->

### Optional domain checks

Use immutable `.check(contract, verifier)` calls for behavior specific to the
plugin. Every verifier gets a fresh application built through public Core
factories; every created value is disposed automatically, including
after a failed assertion. Executing a request needs a database adapter: a
logical-only fixture can start, but `ultimabase.operation(token).execute(...)`
throws `UltimaBase must be started before request execution` until a support
plugin provides one. Without one, check the compiled declaration:

<!-- region ../../examples/plugin-authoring/tests/conformance.test.ts#operation-check -->

```ts
const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({ subject: workflowPlugin() }),
	expected: {
		pluginId: 'community.workflow',
		version: '1.0.0',
		core: '^0.0.0',
	},
}).check('operation', (context) => {
	// Executing a request would need a database adapter among the support
	// plugins; the compiled application already lists the declaration.
	const { ultimabase } = context.createUltimaBase()
	expect(
		ultimabase.compile().operations.map(({ operation }) => operation.name),
	).toStrictEqual([formatWorkflow.name])
})
```

<!-- endregion -->

The optional contract names are `javascript-operation`, `operation`,
`relation-read`, `schema-mutation`, `schema-surface`, `transport`, `middleware`,
`persistence`, `codec`, `migration`, and `adapter-failure`. A `relation-read`
verifier should execute a relation filter or include and assert the portable
relation predicate and declared row filter without selecting a database or
policy product. A `schema-mutation` verifier should
execute one neutral application-owned schema command and assert
its logical identity and physical effect without installing Access, Hooks, or a
product plugin. This keeps the report precise while leaving each
plugin-specific assertion readable. A failed check throws a
`PluginConformanceError` that names its contract; the report lists the
contracts that passed. The `typegen` contract and
`withPluginTypegenConformance()` left with Typegen in migration step 6.8b
(ADR-0297, ADR-0327 decision 4).

For JavaScript, import the same helpers and select `javascript-operation`. Transport checks can use
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

## Lower-level helpers for plugin tests

`@ultimabase/testing/plugins` also exports the helpers of tests that build
their own applications instead of starting one with `testApplication`.

### PostgreSQL worker isolation

`PostgresTestWorker` gives every test worker a deterministic PostgreSQL schema
without depending on a driver. `testApplication` already uses the default
prefix for the worker, so a plugin's own tests choose another:

<!-- region ../../examples/plugin-authoring/tests/postgres-worker.test.ts#postgres-worker -->

```ts
const adminPool = new Pool({ connectionString: databaseUrl })
const worker = new PostgresTestWorker({
	query: async (statement) => {
		await adminPool.query(statement)
	},
	// testApplication uses the default prefix: keep the schemas apart.
	prefix: 'plugin_test',
	workerId: Number(process.env.VITEST_POOL_ID),
})

await worker.reset()

const pool = new Pool({
	connectionString: databaseUrl,
	options: worker.connectionOptions,
})
```

<!-- endregion -->

`reset()` drops and recreates only `worker.schemaName`. `connectionOptions`
sets that schema as the pool's `search_path`. Close the worker pool before
calling `worker.dispose()`, then close the administrative pool.
`PostgresTestWorker` also implements `AsyncDisposable`. `testApplication`
uses it for each worker.

### Capturing logger

`createCapturingLogger()` returns an application logger (ADR-0313) that
records lines instead of printing them, for `new App({ logger })`:

<!-- region ../../examples/plugin-authoring/tests/logger.test.ts#capturing-logger -->

```ts
const logger = createCapturingLogger()
const app = new App({ schemas: [], logger, logLevel: 'debug' })
await app.start()

expect(logger.messages('warn')).toEqual([])
expect(logger.lines.at(-1)?.message).toMatch(/^UltimaBase started:/u)
```

<!-- endregion -->

`lines` keeps every `{ level, message, details }` record in arrival order,
`messages(level?)` lists messages, and `clear()` forgets them.

### Waiting for after-commit work

`waitForAfterCommit()` resolves once the active application's pending
after-commit work has run, like `t.afterCommit()`, for an application a test
started itself. Import it from `@ultimabase/testing/plugins`:

<!-- region ../../examples/plugin-authoring/tests/test-application.test.ts#wait-for-after-commit -->

```ts
await Post.createOne({ data: { title: 'Ship' } })
await waitForAfterCommit()
expect(info).toHaveBeenCalledWith('[audit] Post create-one')
```

<!-- endregion -->

### Fake public operation transport

`FakePublicOperationTransport` exercises an application's explicit generic
operation exposure without installing HTTP or GraphQL. It returns only encoded
success values, safe `FrameworkError` payloads, or declared public
`PluginError` payloads; unknown diagnostics collapse to `INTERNAL_ERROR`.

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
