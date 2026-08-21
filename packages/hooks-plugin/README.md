# @ultimabase/hooks-plugin

Optional official lifecycle Hooks for UltimaBase.

The package contains both the public authoring contract and its Runtime engine.
Importing it does not install behavior; add `hooksPlugin()` to the application
plugin list. Applications that omit it expose no official `hooks` schema or
field option through generated types.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const Post = Schema.define({
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

const ultimabase = new UltimaBase({
	schemas: [Post],
	plugins: [hooksPlugin()],
})
```

## Public surface

The root export has three deliberate groups:

- **Application API:** `hooksPlugin`, `HookContext`, `defineEvent`, generated
  `SchemaHooksOption` and `FieldHooksOption` contracts, and the schema or field
  callback types used for explicit annotations.
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

JavaScript uses the same compiled graph and does not require Typegen. Omitting
the plugin means ordinary CRUD has no official Hooks lifecycle:

```js
import { Schema, UltimaBase } from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new UltimaBase({ schemas: [Post], plugins: [] })
await ultimabase.start()
await Post.findMany(undefined, { ultimabase })
```

Adding a `hooks` option without `hooksPlugin()` is an unknown-option application
compilation error; importing this package alone does not change that result.
The packed PostgreSQL lifecycle is exercised by the
[`hooks-plugin-postgres.postgres.e2e.test.ts`](../../tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts)
public-package suite.

Field `resolveInput` receives a structurally valid immutable value after Core's
initial type and presence checks. It may explicitly normalize that value. Once
all field, schema, and prepared-operation transformations finish, Core runs one
mandatory structural and Standard Schema validation pass before
value-dependent enforcement, observers, or persistence. Hooks providers do not
register or own that revalidation boundary.

A provider declares Hooks as a peer rather than a lifecycle dependency,
because the Hooks engine consumes the provider's contribution capability:

```ts
definePlugin({
	pluginId: 'community.workflow-hooks',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
	// privileges and hook contribution capabilities...
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
	await Post.createOne({ data: { title: 'Published' } }, { ultimabase })
	// Assert the provider's observable ordering and rollback contract here.
})

await runPluginConformance(suite)
```

`definePluginConformanceSuite`, `createPluginConformanceFixture`, and
`runPluginConformance` come from `@ultimabase/testing`; every Hooks symbol in
the example comes from this package root. Independent lifecycle engines are not
expected to run this official-protocol check.
