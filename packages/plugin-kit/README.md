# @ultimabase/plugin-kit

Public authoring helpers for official and community UltimaBase plugins.

`plugin-kit` is not a plugin and installs no Runtime behavior. Core now owns
package identity, configured plugin instances, public plugin typing, provenance,
privilege checks, capability storage, lifecycle, adapters, and Master authority.
Use Core's `definePluginModule()` and `PluginModuleInstance` directly.

Plugin Kit is reserved for optional higher-level composition such as events,
option parsing, contextual fields, and immutable schema-patch builders. Its
temporary milestone-33 re-export of the Core module API exists only while
official packages migrate and is not a second supported authoring path.

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

## Contribute operations through Core

Operation authoring is foundational and no longer requires Plugin Kit. Core's
`contributeOperation()` correlates the token, handler, optional resource
cleanup, and optional wire bindings in one definition:

```ts
import {
	contributeOperation,
	defineOperation,
	defineOperationValue,
} from '@ultimabase/core'

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

const publishContribution = contributeOperation({
	operation: publish,
	execute: ({ input }) => input,
})
```

Add the contribution to the Core plugin definition's `operations` list and
request `operation:declare`. Core derives the static declaration, application
provider, and owner-local identifier. The contribution also accepts
`create(context) => ({ execute, dispose? })` when the handler needs application
capabilities or a resource.

When an operation declares `transaction: 'required'`, Core supplies the
transactional request engine; the handler must not open a redundant nested
transaction.

Transport publication remains explicit: a binding inside the contribution
still requires `transport:expose`, and application configuration must select
the operation. `contributeOperationBinding()` keeps a binding separate from its
handler under the same exact operation owner; foreign binding owners remain
invalid.

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
