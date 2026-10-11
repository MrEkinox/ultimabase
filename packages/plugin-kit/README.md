# @ultimabase/plugin-kit

Public authoring helpers for official and community UltimaBase plugins.

`plugin-kit` is not a plugin and installs no Runtime behavior. Core now owns
package identity, configured plugin instances, public plugin typing, provenance,
privilege checks, capability storage, lifecycle, adapters, and Master authority.
Use Core's `plugin()`, contribution list, and nominal Typegen
references directly. Plugin Kit is reserved for optional higher-level
composition such as the `definePlugin` facade, events, option parsing,
contextual fields, and immutable schema-patch builders. It imports only Core's
public entries, and `@ultimabase/core/plugin` for the authoring contracts.

## Define a plugin from one object

`definePlugin` (ADR-0316) builds the `plugin()` call of the common cases from a
declarative object: shape methods with their fields and commands, `.with({ ... })`
rules, a post-commit callback, and raw contributions. It writes the option
definitions, schema selectors, patches with server-written fields, schema
mutations, model extensions, Runtime behavior and static source types; Core
still derives the privileges.

```ts
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, shapeMethod } from '@ultimabase/plugin-kit'

export const archivePlugin = () =>
	definePlugin({
		name: '@community/archive',
		shape: {
			archivable: shapeMethod({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
						target: 'many',
					}),
				},
			}),
		},
		rules: {
			audit: (value, path) => {
				if (typeof value !== 'boolean')
					throw new TypeError(`${path} must be a boolean`)
				return value
			},
		},
		afterCommit: ({ className, operation, rules }) => {
			if (rules.audit === true)
				console.info(`[audit] ${className} ${operation}`)
		},
	})

// App.Schema.define({ className: 'Post', fields }).archivable().with({ audit: true })
// await Post.archiveOne({ id }) / await Post.archiveMany({ where })
```

- `shapeMethod({ options?, fields?, commands?, permissions? })` declares one
  method chained before `.with(...)`. The method takes one optional options
  object, validated by `options` when the application compiles (an omitted
  object is validated as `{}`); without `options` it takes no argument.
  `fields` are added to the schemas that call the method and rejected in
  create and update input. `permissions` (`['readArchived']`) declares named
  schema permissions on those schemas (ADR-0317): rule plugins such as Access
  grant them by a rule of the same name, and the plugin asks for one with
  `holdsSchemaPermission` from `@ultimabase/core/plugin`.
- `command({ authority, effect, data?, target?, checkReadable? })` declares one
  command without input. `authority: 'request'` commands are ruled by rule
  plugins such as Access under their own name; `'master'` commands need Master.
  `effect: 'delete'` requires `'master'`. `target: 'many'` makes the command
  take `{ where }` and run the one-row rules for each matching row in one
  transaction. `checkReadable: 'before'` suits a command that hides its row.
- One-row request commands are bound to the REST and GraphQL transports without
  input (until transports discover commands generically); many-row commands
  have no binding.
- `rules` validate the entries of `.with({ ... })`; `afterCommit` receives them,
  as `readSchemaRules` from `@ultimabase/core/plugin` returns them to raw
  plugins.
- `contributions` take raw Core contributions or a transport helper such as
  `httpRoutes` from `@ultimabase/http-plugin`.
- Mutation names are derived from the package name, the method and the command
  (`community.archive.archivable.archive-one`).

Keep raw `plugin()` when rules or commands depend on the schema they apply to
(Access, Hooks, ACL) or when a command takes input. With
`isolatedDeclarations`, annotate the factory result with
`DefinedPlugin<Name, Shape, Rules>` and the shape with
`ShapeMethodDefinition<Options, Fields, Commands>`, as Soft Delete does.

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

## Derive environment-dependent defaults

A plugin whose default depends on the deployment reads `NODE_ENV` in its
factory, never per request; Core never reads it (ADR-0312). The helpers keep
that rule in one place: `production` means production, any other value or
none means development, and an explicit option always wins.

```ts
import {
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'

export const auditPlugin = (options: { verbose?: boolean } = {}) => {
	const verbose = deriveEnvironmentDefault(options.verbose, {
		development: true,
		production: false,
	})
	return plugin({
		// …
		contributions: [
			contributeApplication(({ logger }) => {
				logger.debug(
					`verbose ${String(verbose.value)} (${describeEnvironmentSource(verbose.source)})`,
				)
				return { exports: undefined }
			}),
		],
	})
}
```

`readDeploymentEnvironment()` returns `'development'` or `'production'`
directly. Log the derived value and its source at debug level through the
plugin logger (ADR-0313), never an option value or secret.

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

	return schemas.patch(
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

The builder covers additive fields, indexes, and plugin-owned schema or field
option values. ADR-0289 removed `addConstraint()` with Core's portable schema
constraints, which no production plugin consumed. These operations require the same
`schema:declare` privilege that Core would require
without the helper. Destructive replacement, rename, and removal patches are
not plugin powers; the helper does not reintroduce them. Core still validates
every patch's target, ownership, and provenance. `mutationInput: 'forbidden'` reserves an added stored
field for plugin-owned effects while keeping it selectable and physically
persisted; Core applies the same omission to Runtime validation, Typegen,
nested writes, and transport inputs.

Presence selection never reads the direct option value, so the same ordinary
patch builder works for JSON configuration and opaque callback-bearing options.
Use `{ name, path?, equals }` only when structural JSON equality is required.

## Declare contextual fields and options

Plugin-owned field families and direct field options state exactly where they
work. Core owns the field family because it also owns Runtime and Typegen
registration; Plugin Kit keeps only the option and output conveniences:

```ts
import { definePluginFieldFamily } from '@ultimabase/core'
import {
	defineOutputDescriptor,
	definePluginFieldOption,
} from '@ultimabase/plugin-kit'

const ratingFamily = definePluginFieldFamily({
	fieldKind: 'community.rating',
	typegen: {
		module: '@example/rating-plugin',
		valueType: 'RatingValue',
	},
	builder: {
		name: 'rating',
		contexts: {
			output: {
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
				methodType: 'RatingOutputBuilderMethod',
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
context. Return `fields.register(...)` and `schemas.defineOptions(...)` receipts
from the same Core declaration callback; `UltimaBase.use()` then infers the
exact application-local methods and options without a Plugin Kit registry or a
generated plugin-surface copy. A stored representation does not automatically
grant embedded or output behavior, and Core rejects unsupported use before
setup even when JavaScript bypasses autocomplete.

## Contribute operations through Core

Operation authoring is foundational and no longer requires Plugin Kit. Core's
`contributeOperation()` correlates the token, handler, optional resource
cleanup, and optional wire bindings in one definition:

```ts
import {
	contributeOperation,
	defineOperation,
	defineOperationValue,
} from '@ultimabase/core/plugin'

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

Add the contribution to the Core plugin definition's `contributions` list and
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

Use Core's `defineSchemaMutation()` and `contributeSchemaMutation()` directly.
Core derives the mutation declaration and handler provider from one contribution:

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

plugin({
	id: 'community.workflow',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		contributeSchemaMutation({
			mutation: archive,
			resolve: () => ({ data: { workflowState: 'archived' } }),
		}),
		contributeDeclarations({
			models: ({ models }) =>
				models.extend(Post, {
					contributionId: 'workflow-mutations',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema'] },
					},
				}),
		}),
	],
})
```

Keeping these Core calls visible preserves exact owner attribution, the
`operation:declare` and `model:extend` privilege split, target freezing,
collision checks, and the callback-free compilation boundary without repeating
the operation registry or capability-provider plumbing.

## Static and Runtime boundaries

| Concern                         | Static declaration                           | Application/Runtime                            |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Plugin identity and permissions | Core `plugin()` + one contribution list      | Core validates before effects                  |
| Option fingerprint facts        | plugin-owned normalized safe values          | secrets and resources stay out                 |
| Schema patches                  | `schemaPatch` + `patchSchemas`               | Core applies owner-attributed operations       |
| Operations                      | Core-owned operation contribution            | handler materializes and executes through Core |
| Typegen                         | Core nominal references and structured facts | no executable generated client                 |

## When to use Core directly

Use `@ultimabase/core` directly for:

- capability definitions, providers, and requirements;
- Runtime middleware, protected constraints, and persistence rewrites;
- transport bindings and lifecycle;
- every privilege, owner, registry, Master, or security decision.

`plugin-kit` intentionally contains no generic registry, service locator,
privilege shortcut, authority helper, or adapter escape hatch.
