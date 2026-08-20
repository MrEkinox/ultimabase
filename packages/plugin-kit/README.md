# @ultimabase/plugin-kit

Public authoring helpers for official and community UltimaBase plugins.

`plugin-kit` is not a plugin and installs no Runtime behavior. It removes common
declaration boilerplate while delegating owner attribution, privilege checks,
capability storage, schema validation, lifecycle, adapters, and Master authority
to `@ultimabase/core`.

## Define one package once

Bind the stable package facts once, then create as many explicit instances as
the application needs:

```ts
import { definePluginModule } from '@ultimabase/plugin-kit'

const workflow = definePluginModule({
	pluginId: 'community.workflow',
	version: '1.0.0',
	core: '^1.0.0',
})

export const workflowPlugin = (instanceId?: string) =>
	workflow.plugin({
		...(instanceId === undefined ? {} : { instanceId }),
		privileges: [
			{
				name: 'operation:declare',
				reason: 'Declares workflow operations.',
			},
		] as const,
		setup: () => ({ ready: true as const }),
	})
```

The module cannot override or grant a privilege. Its `plugin(...)` method calls
Core's public `definePlugin(...)`, which validates the complete manifest and
binds the real `{ pluginId, instanceId? }` owner. Keep using Core directly when
one file contains a single definition and binding the three stable package facts
would not improve consistency.

`plugin(...)` also forwards Core's structured `peers` option. Use it when an
extension requires a compatible engine but the engine consumes the extension's
capability, so no lifecycle edge should be introduced.

### Name an exact public plugin type

Packages compiled with TypeScript `isolatedDeclarations` cannot always publish
the inferred return type of a plugin factory. `PluginModuleInstance` maps a
module plus a named, property-based definition contract to the same exact
`FrameworkPlugin` type without repeating its positional generic tuple:

```ts
import {
	definePluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

const workflow = definePluginModule({
	pluginId: 'community.workflow',
	version: '1.0.0',
	core: '^1.0.0',
})
const privileges = [
	{
		name: 'runtime:observe',
		reason: 'Records workflow timing.',
	},
] as const
type WorkflowDefinition = Readonly<{
	readonly instanceId: 'editorial'
	readonly privileges: typeof privileges
	readonly setup: () => Readonly<{ readonly ready: true }>
}>

export type WorkflowPlugin = PluginModuleInstance<
	typeof workflow,
	WorkflowDefinition
>
export const workflowPlugin = (): WorkflowPlugin =>
	workflow.plugin({
		instanceId: 'editorial',
		privileges,
		setup: () => ({ ready: true as const }),
	})
```

The definition contract names only real Core manifest properties. Privilege
names and reasons, capability IDs, peers, and instance identity remain visible;
the utility is type-only and does not install or validate anything itself.

## Publish typed post-commit events

The event helpers remove the repeated contract, observer capability, and
transaction-journal plumbing shared by independent plugins. A producer defines
one versioned channel and consumes its optional requirement; observers retain
their own `runtime:observe` privilege and provenance:

```ts
const published = definePluginEvent<PublishedEvent>()('workflow.published', {
	delivery: 'optional',
})
const workflowEvents = definePluginEventCapability({
	capabilityId: 'community.workflow-events',
	version: '1.0.0',
})

const observer = providePluginEvent(
	workflowEvents,
	'audit-published',
	observePluginEvent(published, ({ event }) => audit.write(event.payload)),
)
```

The producer creates its dispatcher from `createPluginEventDispatcher(...)`,
passing the factory's Core-owned `owner` and `assertPrivilege`, then calls
`emit(...)` inside an active transaction. Payloads are detached JSON and
handlers run only after commit in capability contribution order. The helper
does not install Runtime behavior; the producer still owns its generic Runtime
provider and requests `event:publish`.

## Parse plugin options once

`definePluginOptionsParser(...)` validates the root object, rejects unknown
string or symbol keys, gives the normalizer only declared keys as `unknown`, and
freezes the normalized root:

```ts
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'

const parseOptions = definePluginOptionsParser({
	name: 'workflow plugin options',
	keys: ['instanceId', 'mode'] as const,
	normalize: ({ instanceId, mode }) => {
		if (instanceId !== undefined && typeof instanceId !== 'string') {
			throw new TypeError('workflow instanceId must be a string')
		}
		if (mode !== undefined && mode !== 'review' && mode !== 'publish') {
			throw new TypeError('workflow mode must be review or publish')
		}

		return {
			...(instanceId === undefined ? {} : { instanceId }),
			mode: mode ?? 'review',
		}
	},
})
```

The helper deliberately does not introduce a second validation language. Use a
standard schema library inside `normalize` when the plugin already depends on
one. Nested callbacks, connections, and secrets remain Runtime values owned by
the plugin; normalize or freeze them according to their own contract.
`formatUnknownKey` may preserve an established plugin-specific diagnostic when
migrating an existing parser; new plugins normally use the default message.

## Build common additive schema patches

`SchemaPatchBuilder` is immutable. Each call delegates to Core's nominal patch
factory and returns a new builder:

```ts
import { stringField } from '@ultimabase/core'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

declare: ({ schemas }) => {
	const targets = schemas.select({
		option: { name: 'workflow', path: ['enabled'], equals: true },
	})

	schemas.patch(
		patchSchemas({
			targets,
			patch: schemaPatch()
				.addField({
					contributionId: 'workflow-state',
					name: 'workflowState',
					field: stringField(),
				})
				.addIndex({
					contributionId: 'workflow-state-index',
					fields: ['workflowState', 'createdAt'],
				}),
		}),
	)
}
```

The builder covers additive fields, indexes, extensions, constraints, and
plugin-owned schema or field option values. These operations require the same
`schema:declare` or `schema:transform` privileges that Core would require
without the helper. Replacement, rename, removal, and exact cross-owner targets
stay in Core's explicit factories because their provenance checks should remain
visible at the call site.

## Provide an operation without wrapper nesting

Core keeps operation tokens, capability ownership, Runtime execution, and
transport exposure separate. `providePluginOperation(...)` only flattens the
common capability resource and handler wrappers:

```ts
import { defineOperation, defineOperationValue } from '@ultimabase/core'
import { providePluginOperation } from '@ultimabase/plugin-kit'

const text = defineOperationValue((value, path): string => {
	if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
	return value
})

export const publish = defineOperation({
	name: 'community.workflow.publish',
	version: '1.0.0',
	target: 'application',
	transaction: 'required',
	input: text,
	result: text,
})

const publishProvider = providePluginOperation({
	contributionId: 'publish',
	operation: publish,
	execute: ({ input }) => input,
})
```

Add the provider to `capabilities.provides`, declare the token through the
owner-bound `operations` facade, and request `operation:declare`. The helper
also accepts `create(context) => ({ execute, dispose? })` when the handler needs
application capabilities or a resource. It never exposes a connection, raw
adapter, protected constraints, transport, or authority that the handler did
not already receive through Core.

When an operation declares `transaction: 'required'`, Core supplies the
transactional request engine; the handler must not open a redundant nested
transaction.

Transport publication remains a separate explicit binding and still requires
`transport:expose`.

## Group Typegen references

Use one module object when several public types come from the same package:

```ts
import { defineTypegenModule } from '@ultimabase/plugin-kit'

const workflowTypes = defineTypegenModule('@example/workflow-plugin')

export const publishInputType = workflowTypes.reference('PublishInput')
export const publishResultType = workflowTypes.reference('PublishResult')
```

Every reference still crosses Core's nominal `defineTypegenReference(...)`
boundary. Registering or contributing it requires the corresponding
`typegen:reference` or `typegen:contribute` privilege. Typegen produces inert
declarations only; this helper cannot emit JavaScript or create a Runtime client.

## Static and Runtime boundaries

| Concern                        | Static declaration                      | Application/Runtime                            |
| ------------------------------ | --------------------------------------- | ---------------------------------------------- |
| Plugin identity and privileges | `definePluginModule` + `module.plugin`  | Core validates before effects                  |
| Option fingerprint facts       | plugin-owned normalized safe values     | secrets and resources stay out                 |
| Schema patches                 | `schemaPatch` + `patchSchemas`          | Core applies owner-attributed operations       |
| Operations                     | token and provider declaration          | handler materializes and executes through Core |
| Typegen                        | nominal references and structured facts | no executable generated client                 |

## When to use Core directly

Use `@ultimabase/core` directly for:

- capability definitions, requirements, decoration, and replacement;
- destructive or cross-owner schema transformations;
- Runtime middleware, protected constraints, and persistence rewrites;
- raw adapter leases, transport bindings, migration intent, and lifecycle;
- every privilege, owner, registry, Master, or security decision.

`plugin-kit` intentionally contains no generic registry, service locator,
privilege shortcut, authority helper, or adapter escape hatch.
