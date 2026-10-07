# @ultimabase/hooks-plugin

Optional official lifecycle Hooks for UltimaBase.

The package contains both the public authoring contract and its Runtime engine.
Importing it does not install behavior; add `hooksPlugin()` to the application
`.use()` chain. The configured factory exposes field `hooks` directly from
source. Schema `hooks` callbacks use the retained Typegen graph because their
exact items, operations, relationships, and plugin mutation keys require the
completed application contract; factories that omit the plugin expose neither.

The field-level `hooks` option is available on stored fields and recursively
embedded object properties. It is intentionally absent from virtual wrappers
and output descriptors because those values never participate in mutation input
resolution.

```ts
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const Application = UltimaBase.use(hooksPlugin())
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
	hooks: {
		beforeOperation: {
			create: ({ item }) => {
				console.log(item.title)
			},
		},
	},
})

const ultimabase = new Application({
	schemas: [Post],
})
```

## Public surface

The root export has three deliberate groups:

- **Application API:** `hooksPlugin`, `HookContext`, `defineEvent`, and the
  schema or field callback types used for explicit annotations.
- **Compatible-provider contract:** `hookContributionsCapability`,
  `provideHookContributions`, `globalHooks`, `schemaHooks`, `fieldHooks`, the
  typed field-path and phase contracts, plus
  `hookEventContributionsCapability`, `onEvent`, and `provideHookEvent`.
- **Conformance support:** `hookDiagnosticsObserverCapability` and the redacted
  diagnostic event, owner, target, phase, and observer types.

The capability token is public so a compatible engine can consume the same
versioned protocol. The provider factory and target helpers are the preferred
authoring path for community plugins because they validate and normalize the
official declarations before the engine receives them.

Raw schema-option definitions, normalization functions, normalized declaration
storage, and Core-attributed `OwnedHookContribution` values are implementation
details. They are intentionally unavailable from the package root. Importing
the package still performs no registration or Runtime work.

Plugins intentionally contributing to the official lifecycle may import its
callback types, selectors, and capability contracts from this package. Independent
behavior engines should own their vocabulary and use Core's generic Runtime
behavior capability directly.

The engine retains callback ownership through execution: inline schema Hooks
run as application callbacks, while capability-contributed Hooks run under the
exact contributing plugin instance. Nested queries inherit caller-selected
Master authority, but a contributed Hook that initiates a fresh Master
elevation must request `authority:elevate`; the Hooks plugin never lends its own
privileges to that provider.

Hooks checks cooperative cancellation through Core's public
`throwIfOperationCancelled()` helper before and after cancellable callback
boundaries. Independent behavior engines can use that same helper with their
own `AbortSignal`; it standardizes the `OPERATION_CANCELLED` failure but does
not detach or forcibly terminate running JavaScript.

Schema mutation Hooks receive an optional `nestedWrite` value when their
ordinary lifecycle belongs to a nested mutation. It is the same immutable,
selection-independent Core graph for the root and every created child; it is
absent for standalone mutations. Root `afterOperation` runs only after all
descendant objects and relation memberships are complete, so a Hook-started
query observes the transaction-final graph without receiving hydrated relation
results through the Hook input.

JavaScript uses the same compiled graph and does not require Typegen. Omitting
the plugin means ordinary CRUD has no official Hooks lifecycle:

```js
import { UltimaBase } from '@ultimabase/core'

const Post = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new UltimaBase({ schemas: [Post] })
await ultimabase.start()
await Post.findMany(undefined)
```

Adding a `hooks` option without `hooksPlugin()` is an unknown-option application
compilation error; importing this package alone does not change that result.
The packed PostgreSQL lifecycle is exercised by the
[`hooks-plugin-postgres.postgres.e2e.test.ts`](tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts)
public-package suite.

## Plugin-owned schema mutations

Typegen projects every schema mutation in the compiled graph into the same
grouped `beforeOperation` and `afterOperation` callback contract. The Runtime
declaration remains source-owned. Both request and Master-only commands are
present because trusted maintenance operations still retain business Hooks:

```ts
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const Application = UltimaBase.use(hooksPlugin())
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
	hooks: {
		beforeOperation: {
			softDelete: ({ context, input, item, originalItem, target }) => {
				console.log(context.requestId, input, target.id)
				console.log(originalItem, item)
			},
		},
		afterOperation: {
			softDelete: ({ item, mutation }) => {
				console.log(mutation.name, item)
			},
		},
	},
})

const ultimabase = new Application({
	schemas: [Post],
})
```

The callback input and target are immutable. Before Hooks receive the validated
payload, locked preimage, and owner-resolved candidate. After Hooks receive the
adapter-validated persisted pair before commit. Delete effects expose `item` as
`null`. These callbacks may observe, reject, start transaction-inheriting
queries, or emit post-commit events; returning a value never replaces the
payload, effect, result, or persistence plan.

Dispatch uses the custom logical command, never its physical statement. A
`softDelete` implemented by `update-one` therefore runs only
`beforeOperation.softDelete` and `afterOperation.softDelete`; it does not run
native update or delete Hooks. JavaScript declarations are validated against
the same final application mutation catalog during startup, so stale command
keys fail before Runtime work begins.

Compatible providers use the existing `schemaHooks()` and
`provideHookContributions()` factories. Their callbacks retain the provider's
own plugin identity and `runtime:intercept` privilege; the Hooks engine does not
lend the mutation owner's privileges.

Field `resolveInput` receives a structurally valid immutable value after Core's
initial type and presence checks. It may explicitly normalize that value. Once
all field, schema, and prepared-operation transformations finish, Core runs one
mandatory structural validation pass. When installed, the optional Validation
plugin then runs Standard Schema field validators through the final mutation
input guard, before value-dependent enforcement, observers, or persistence.
Hooks providers do not register or own either validation boundary.

A provider declares Hooks as a peer rather than a lifecycle dependency,
because the Hooks engine consumes the provider's contribution capability:

```ts
plugin({
	id: 'community.workflow-hooks',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
	permissions: { 'runtime:intercept': 'Contributes workflow Hooks.' },
	contributions: [provideHookContributions(/* ... */)],
})
```

## Compatible-provider conformance

Providers can exercise the public engine without a deep import by making their
plugin the conformance subject and installing `hooksPlugin()` as support:

```ts
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: workflowHooksPlugin(),
			supportPlugins: [hooksPlugin()],
			schemas: [Post],
		}),
	expected: {
		core: '^0.0.0',
		pluginId: 'community.workflow-hooks',
		version: '1.0.0',
	},
}).check('middleware', async ({ createUltimaBase }) => {
	const { ultimabase } = createUltimaBase()
	await ultimabase.start()
	await Post.createOne({ data: { title: 'Published' } })
	// Assert the provider's observable ordering and rollback contract here.
})

await runPluginConformance(suite)
```

`definePluginConformanceSuite`, `createPluginConformanceFixture`, and
`runPluginConformance` come from `@ultimabase/testing`; every Hooks symbol in
the example comes from this package root. Independent lifecycle engines are not
expected to run this official-protocol check.
