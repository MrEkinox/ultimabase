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

Transport authors also use Core directly for
`applicationRequestExecutionCapability`. Declare its exact requirement, then
capture the resulting facade, application callback executor, and owner inside
the transport's own application capability factory. Plugin Kit intentionally
adds no wrapper that could obscure request attribution, Master elevation, or
the Core-owned lifecycle boundary.

Owner-private collections likewise use Core's `definePrivateCollection()` and
`privateStore()` directly. Plugin Kit deliberately adds no repository wrapper:
the visible collection token and Core's attributed callback preserve exact
application and plugin-instance ownership. `definePluginModule()` may still
remove repeated package identity fields from plugins requesting the critical
`storage:private` privilege.

`plugin(...)` also forwards Core's structured `peers` option. Use it when an
addon requires a compatible engine but the engine consumes the addon's
capability, so no lifecycle edge should be introduced.

Keep every definition in the application's flat `plugins` list. Use
`dependencies` for required identity plus provider-first lifecycle order,
`optionalDependencies` for that order only when the provider is installed,
`peers` for compatible identity without order, and capabilities for versioned
behavior that may have interchangeable providers.

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

`definePluginOptionsParser(...)` accepts a synchronous
[Standard Schema](https://standardschema.dev/) validator directly. The chosen
library owns input validation, defaults, transformations, and unknown-key
behavior while Plugin Kit preserves the inferred input/output types and freezes
the normalized root:

```ts
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { z } from 'zod'

const parseOptions = definePluginOptionsParser({
	name: 'workflow plugin options',
	schema: z.strictObject({
		instanceId: z.string().optional(),
		mode: z.enum(['review', 'publish']).default('review'),
	}),
})
```

Use the strict-object facility from the selected schema library when unknown
keys must fail. A stripping or passthrough schema keeps its own behavior.
Validation must complete synchronously; async refinements fail immediately
because plugin factories and static declarations are synchronous. Successful
output must be a plain object. Nested callbacks, connections, and secrets remain
Runtime values owned by the plugin; validate or freeze them according to their
own contract.

Plugins without a schema dependency can keep using the original strict manual
contract. It rejects undeclared string or symbol keys and gives the normalizer
only declared values as `unknown`:

```ts
const parseOptions = definePluginOptionsParser({
	name: 'workflow plugin options',
	keys: ['instanceId', 'mode'] as const,
	normalize: ({ instanceId, mode }) => ({
		instanceId: typeof instanceId === 'string' ? instanceId : undefined,
		mode: mode === 'publish' ? 'publish' : 'review',
	}),
})
```

`formatUnknownKey` may preserve an established plugin-specific diagnostic when
migrating an existing manual parser; new plugins normally use the default
message. Plugin Kit depends only on the types-only `@standard-schema/spec`
protocol and never installs Zod or another concrete validator for consumers.

## Build common additive schema patches

`SchemaPatchBuilder` is immutable. Each call delegates to Core's nominal patch
factory and returns a new builder:

```ts
import { stringField } from '@ultimabase/core'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

declare: ({ schemas }) => {
	const targets = schemas.select({
		option: { name: 'workflow' },
	})

	schemas.patch(
		patchSchemas({
			targets,
			patch: schemaPatch()
				.addField({
					contributionId: 'workflow-state',
					name: 'workflowState',
					field: stringField({ default: 'pending', required: true }),
					mutationInput: 'forbidden',
				})
				.addIndex({
					contributionId: 'workflow-state-index',
					fields: ['workflowState', 'createdAt'],
				}),
		}),
	)
}
```

The builder covers additive fields, indexes, constraints, and
plugin-owned schema or field option values. These operations require the same
`schema:declare` privilege that Core would require
without the helper. Replacement, rename, removal, and exact cross-owner targets
stay in Core's explicit factories because their provenance checks should remain
visible at the call site. `mutationInput: 'forbidden'` reserves an added stored
field for plugin-owned effects while keeping it selectable and physically
persisted; Core applies the same omission to Runtime validation, Typegen,
nested writes, and transport inputs.

Presence selection never reads the direct option value, so the same ordinary
patch builder works for JSON configuration and opaque callback-bearing options.
Use `{ name, path?, equals }` only when structural JSON equality is required.

## Declare contextual fields and options

Plugin-owned builder methods and direct field options state exactly where they
work. Plugin Kit forwards these declarations through Core's nominal factories,
so the helpers reduce repeated imports without weakening provenance or
application-local ownership:

```ts
import {
	defineOutputDescriptor,
	definePluginFieldBuilderMethod,
	definePluginFieldOption,
} from '@ultimabase/plugin-kit'

const ratingMethod = definePluginFieldBuilderMethod({
	name: 'rating',
	contexts: {
		output: {
			fieldKind: 'community.rating',
			factory: () =>
				defineOutputDescriptor(
					'community.rating',
					{ list: false, nullable: false },
					(value, path) => {
						if (typeof value !== 'number') {
							throw new TypeError(`${path} must be a number`)
						}
						return value
					},
				),
			typegen: {
				methodType: 'RatingOutputBuilderMethod',
				module: '@example/rating-plugin',
				valueType: 'RatingValue',
			},
		},
	},
})

const searchableOption = definePluginFieldOption({
	contexts: ['stored'],
	normalize: (value) => value === true,
	protocolVersion: 1,
	typegen: {
		module: '@example/rating-plugin',
		type: 'SearchableFieldOption',
	},
})
```

The closed contexts are `stored`, `embedded`, `virtual`, and `output`. A method
may provide a different factory and public callable type in each supported
builder. A stored representation does not automatically grant embedded or
output behavior, and Core rejects unsupported use before setup even when
JavaScript or a stale generated declaration bypasses autocomplete.

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

## Declare schema mutations without another wrapper

Use Core's `defineSchemaMutation()` and the owner-bound `operations` and
`models` facades directly. `definePluginModule()` may remove repeated package
identity fields, but Plugin Kit does not wrap the mutation token or its
`schemaMutations` binding:

```ts
const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue(snapshotArchiveInput),
	name: 'community.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.0.0',
})

workflow.plugin({
	privileges: [
		{ name: 'operation:declare', reason: 'Declares archive.' },
		{ name: 'model:extend', reason: 'Adds archive methods.' },
	],
	declare: ({ models, operations }) => {
		operations.declare(archive)
		models.extend(Post, {
			contributionId: 'workflow-mutations',
			schemaMutations: {
				archive: { mutation: archive, surfaces: ['schema', 'model'] },
			},
		})
	},
})
```

Keeping these Core calls visible preserves exact owner attribution, the
`operation:declare` and `model:extend` privilege split, target freezing,
collision checks, and the callback-free compilation boundary.

## Group Typegen references

Use one module object when several public types come from the same package:

```ts
import { defineTypegenModule } from '@ultimabase/plugin-kit'

const workflowTypes = defineTypegenModule('@example/workflow-plugin')

export const publishInputType = workflowTypes.reference('PublishInput')
export const publishResultType = workflowTypes.reference('PublishResult')
```

Every reference still crosses Core's nominal `defineTypegenReference(...)`
boundary. Registering it requires `typegen:reference`; generated contracts come
from the compiled graph. Typegen produces inert
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

- capability definitions, providers, and requirements;
- Runtime middleware, protected constraints, and persistence rewrites;
- raw adapter leases, transport bindings, migration intent, and lifecycle;
- every privilege, owner, registry, Master, or security decision.

`plugin-kit` intentionally contains no generic registry, service locator,
privilege shortcut, authority helper, or adapter escape hatch.
