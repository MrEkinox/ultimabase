# `@ultimabase/access-plugin`

The optional official Access engine for UltimaBase. The package owns schema and
field `access` declarations, deterministic policy compilation, diagnostics, and
protected Runtime enforcement. Importing it has no effect; an application must
configure `accessPlugin()` explicitly.

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { Schema, UltimaBase } from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		secret: field.string({ access: { read: false } }),
		title: field.string(),
	}),
	access: {
		read: { where: ({ where }) => where.eq('published', true) },
	},
})

const ultimabase = new UltimaBase({
	plugins: [accessPlugin()],
	schemas: [Post],
})
```

## Public surface

The root export has three deliberate groups:

- **Application API:** `accessPlugin`, its options, `AccessContext`, generated
  `SchemaAccessOption` and `FieldAccessOption` contracts, schema and field rule
  types, and the `allowAll`, `denyAll`, `anyOf`, `allOf`, `not`,
  `allOperations`, and `allMutations` authoring helpers.
- **Compatible-provider contract:** `accessContributionsCapability`,
  `provideAccessContributions`, the direct and field-kind contribution
  factories, `defineFieldKindAccessTarget`, and their input or definition
  types.
- **Conformance support:** `accessDiagnosticsObserverCapability` and the
  redacted diagnostic identity, event, observer, and capability types.

The capability token remains public so a compatible engine can consume the
same versioned provider protocol. Community providers should use the public
factory and target helpers, which normalize declarations before the official
engine receives them.

Raw schema-option definitions, normalization functions, normalized declaration
storage, the unused context-narrowing helper, and Core-attributed
`OwnedAccessContribution` values are implementation details. They are
intentionally unavailable from the package root. Importing the package still
performs no registration or Runtime work.

Without `accessPlugin()`, the `access` option is not declared and application
compilation fails. Typegen emits the corresponding option augmentations only
for applications that install the plugin.

JavaScript uses the same compiled graph without generated declarations. This
application intentionally has no Access engine, so direct CRUD has no official
Access policy stage:

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

Core validation, transactions, protected constraints, and anonymous or
audited-master authority remain active. Importing this package alone installs
nothing, and declaring `access` without `accessPlugin()` fails compilation.
The packed policy vertical is exercised by the
[`access-plugin-postgres.postgres.e2e.test.ts`](../../tests/e2e/access-plugin-postgres.postgres.e2e.test.ts)
public-package suite.

## Defaults

The default is permissive when no exact declaration exists. Applications may
choose one complete application-local fallback:

```ts
accessPlugin({ default: false })
accessPlugin({ default: { field: true, operation: false } })
```

Defaults belong to the configured plugin instance and never mutate a schema or
another application.

Trusted master requests bypass the complete official Access policy. Therefore
`false`, callback denials, row filters, field restrictions, and configured
defaults apply only to non-master callers. Validation, hooks, transactions, and
database constraints still execute.

## Official-compatible providers

A plugin that intentionally contributes official Access declarations uses the
public contribution helpers and declares a non-ordering peer. The provider may
appear before or after the engine in plugin configuration.

```ts
import {
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { definePlugin } from '@ultimabase/core'

export const editorialPolicyPlugin = definePlugin({
	version: '1.0.0',
	core: '^0.0.0',
	pluginId: 'community.editorial-policy',
	peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
	privileges: [
		{
			name: 'runtime:constrain',
			reason: 'Contributes official Access policy.',
		},
	],
	capabilities: {
		provides: [
			provideAccessContributions('published-posts', () =>
				schemaAccess(Post, {
					read: {
						where: ({ where }) => where.eq('published', true),
					},
				}),
			),
		],
	},
})
```

`globalAccess`, `schemaAccess`, and `fieldAccess` cover direct targets.
`fieldKindAccess` lets a provider protect every occurrence of a field kind it
owns; `defineFieldKindAccessTarget` creates the exact namespaced target. A
provider that owns a direct option can compile each occurrence through that
option's Runtime compiler, while structural selection remains available to
schema-declaration plugins. All Access helpers normalize declarations before
the official engine consumes them.
Every provider policy narrows the developer policy; no contribution can
override an earlier denial.
Compatible-provider policies share the engine's unconditional master bypass;
the contribution helpers expose no per-policy master mode.

Contributors do not inherit the Access engine's privileges. Inline Access callbacks execute as
application callbacks, while contributed rules execute under their exact
plugin and optional instance identity through Core's application-bound callback
executor. A rule that initiates a new Master elevation therefore needs its own
`authority:elevate` request. Already-master requests bypass the complete Access
policy before any callback executes.

Independent policy engines should not depend on this package. They can define
their own authoring vocabulary and contribute Core `protectedPolicy()` values
directly.

### Compatible-provider conformance

An official-compatible provider can test its declarations through package-root
exports by making itself the conformance subject, installing `accessPlugin()`
as support, and attaching a product-owned `persistence` check:

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: editorialPolicyPlugin,
			supportPlugins: [accessPlugin(), databaseFixturePlugin()],
			schemas: [Post],
		}),
	expected: {
		core: '^0.0.0',
		pluginId: 'community.editorial-policy',
		version: '1.0.0',
	},
}).check('persistence', async ({ createUltimaBase }) => {
	const { ultimabase } = createUltimaBase()
	await ultimabase.start()
	await Post.findMany(undefined, { ultimabase })
	// Assert the adapter-visible row filter and monotonic denial here.
})

await runPluginConformance(suite)
```

The suite helpers come from `@ultimabase/testing`; the Access engine and
provider helpers come from this package root. A provider can add focused item,
field, relation, transition, and master-bypass assertions without asking an
independent policy engine to adopt this vocabulary.

ACL follows that independent path: `@ultimabase/acl-permissions-plugin` depends
only on Core's generic protected-policy and adapter-constraint contracts. It
protects ACL-enabled schemas with no official Access engine installed and
composes monotonically when Access or another policy engine is present.

## Diagnostics

Provide `accessDiagnosticsObserverCapability` from a plugin with
`runtime:observe` to receive immutable callback completion events. Observer
failures are isolated and cannot change a policy outcome.
