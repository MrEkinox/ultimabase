# @ultimabase/plugin-kit

Public authoring helpers for official and community UltimaBase plugins.

`plugin-kit` is not a plugin and installs no Runtime behavior. Core now owns
package identity, configured plugin instances, public plugin typing, provenance,
privilege checks, capability storage, lifecycle, adapters, and Master authority.
Use Core's `plugin()` and contribution list directly. Plugin Kit is reserved for optional higher-level
composition such as the `definePlugin` facade, events, option parsing,
contextual fields, immutable schema-patch builders, and the role protocol
shared by permission and role providers. It imports only Core's
public entries, and `@ultimabase/core/plugin` for the authoring contracts.

## Define a plugin from one object

`definePlugin` (ADR-0316) builds the `plugin()` call of the common cases from a
declarative object: features (keys of `define`) with their fields and
commands, rules (keys of `.with({ ... })`), a post-commit callback,
and raw contributions. It writes the option
definitions, schema selectors, patches with server-written fields, schema
mutations, model extensions, Runtime behavior and static source types; Core
still derives the privileges. The
[plugin authoring example](../../examples/plugin-authoring/README.md) declares
a feature in one plugin and a rule in another:

<!-- region ../../examples/plugin-authoring/src/archive-plugin.ts#archive-plugin -->

```ts
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'

/** `archivable: true` adds a server-written `archivedAt` and two commands. */
export const archivePlugin = () =>
	definePlugin({
		name: '@example/archive-plugin',
		features: {
			archivable: feature({
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
	})
```

<!-- endregion -->

<!-- region ../../examples/plugin-authoring/src/audit-plugin.ts#audit-plugin -->

```ts
import { definePlugin } from '@ultimabase/plugin-kit'

/** `.with({ audit: true })` logs each committed write of the schema. */
export const auditPlugin = () =>
	definePlugin({
		name: '@example/audit-plugin',
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
```

<!-- endregion -->

A schema of an application that installs both sets the feature in `define`
and calls the rule in `.with`, and may expose a one-row command over REST and
GraphQL:

<!-- region ../../examples/plugin-authoring/src/schema.ts#post -->

```ts
export const Post = App.Schema.define({
	className: 'Post',
	fields: (f) => ({ title: f.string({ required: true }) }),
	archivable: true,
}).with({
	audit: true,
	rest: { archiveOne: true },
	graphql: { archiveOne: true },
})
```

<!-- endregion -->

<!-- region ../../examples/plugin-authoring/tests/schema-contributions.test.ts#archive-one,archive-many -->

```ts
const archived = await Post.archiveOne({ id: post.id })

const archivedPosts = await Post.archiveMany({
	where: { title: { in: ['Old'] } },
})
```

<!-- endregion -->

- `feature({ options?, fields?, commands?, permissions?, requires? })`
  declares one key of `define`. The key takes `true` or, when the feature has
  an `options` validator, a static options object, validated when the
  application compiles (`true` is validated as `{}`). `fields` are added to
  the schemas that set the key and rejected in create and update input. `permissions` (`['readArchived']`) declares named
  schema permissions on those schemas (ADR-0317): rule plugins such as Access
  grant them by a rule of the same name, and the plugin asks for one with
  `holdsSchemaPermission` from `@ultimabase/core/plugin`.
- `command({ authority, effect, data?, target?, checkReadable? })` declares one
  command without input. `authority: 'request'` commands are ruled by rule
  plugins such as Access under their own name; `'master'` commands need Master.
  `effect: 'delete'` requires `'master'`. `target: 'many'` makes the command
  take `{ where }` and run the one-row rules for each matching row in one
  transaction. `checkReadable: 'before'` suits a command that hides its row.
- REST and GraphQL expose a one-row request command only when the schema
  names it, `.with({ rest: { archiveOne: true }, graphql: { archiveOne: true } })`,
  without any binding (ADR-0324): `POST /api/classes/Post/{id}/archive-one`
  and the `archiveOnePost(input: { id })` mutation. Many-row commands stay
  off both transports.
- `rules` validate the values given to `.with`, one key per rule; `afterCommit` receives them, as `readSchemaRules` from
  `@ultimabase/core/plugin` returns them to raw plugins.
- `contributions` take raw Core contributions or a transport helper such as
  `httpRoutes` from `@ultimabase/http-plugin`.
- Mutation names are derived from the package name, the feature and the command
  (`example.archive-plugin.archivable.archive-one` for `@example/archive-plugin`).
- The plugin declares the Core range of the installed Plugin Kit (`^0.0.0` for
  the pre-release packages), which moves with Core at every release. Core
  checks it against the installed Core like a peer range and rejects a mismatch
  with `PLUGIN_PROTOCOL_INCOMPATIBLE` (ADR-0338); `defineOperation` does the
  same.

Keep raw `plugin()` when rules or commands depend on the schema they apply to
(Access, Hooks, ACL) or when a command takes input. With
`isolatedDeclarations`, annotate the factory result with
`DefinedPlugin<Name, Features, Rules>` and each feature with
`FeatureDefinition<Options, Fields, Commands>`, as Soft Delete does.

### Features and rules

ADR-0339 splits what a plugin contributes to a schema in two. `define`
describes the data model: the fields, their constraints and indexes, which
Core owns, plus the features that add something to the schema (fields,
commands). `.with({ … })` describes how each plugin treats that schema; a
storage setting of one plugin, such as a table name, is a rule because it
changes nothing application code can write. The
[Features and Rules](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/features-and-rules.mdx)
guide explains how to choose:

- **Features** add something to the data model. They are keys of `define`,
  with static values only (`true` or an options object), and may add fields,
  commands and permissions. Declare them with `features` and `feature(...)`.
  A feature may list the rules of the same plugin it requires
  (`requires: ['review']`): TypeScript reports a declaration that sets the
  feature without them, and Core rejects it when `.with` runs or the
  application compiles.
- **Rules** describe how the plugin treats a schema. Each is one key of
  `.with`, such as `.with({ review: 'editors' })`. `definePlugin` declares
  their names when the plugin is created and types each key from its
  validator; a raw `plugin()` declares them with
  `provideSchemaRules(instance, names)` from `@ultimabase/core/plugin` and
  may type them against the completed schema through a rules slot, so they
  may hold callbacks.
- `className`, `fields`, `indexes`, `relations` and `with` are reserved by
  Core: a feature or rule with one of these names is rejected.

The example's review plugin declares a feature that requires its rule:

<!-- region ../../examples/plugin-authoring/src/review-plugin.ts#review-plugin -->

```ts
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'

/**
 * `reviewable: true` in `define` adds `reviewedAt` and `approveOne`; it
 * requires `review: 'editors'` in `.with`, which names the reviewers.
 */
export const reviewPlugin = () =>
	definePlugin({
		name: '@example/review-plugin',
		// Features: what a schema is. Static values, keys of `define`.
		features: {
			reviewable: feature({
				fields: { reviewedAt: dateTimeField() },
				commands: {
					approveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ reviewedAt: new Date().toISOString() }),
					}),
				},
				requires: ['review'],
			}),
		},
		// Rules: how the plugin treats a schema. Keys of `.with`.
		rules: {
			review: (value, path) => {
				if (typeof value !== 'string' || value === '')
					throw new TypeError(`${path} must name the reviewers`)
				return value
			},
		},
		afterCommit: ({ className, operation, rules }) => {
			if (operation === 'create-one' && typeof rules.review === 'string')
				console.info(`[review] ${className} waits for ${rules.review}`)
		},
	})
```

<!-- endregion -->

<!-- region ../../examples/plugin-authoring/tests/features-and-rules.test.ts#reviewed-story -->

```ts
const Story = App.Schema.define({
	className: 'Story',
	fields: (f) => ({ title: f.string({ required: true }) }),
	reviewable: true,
	// `indexes` may name a field the feature adds.
	indexes: [{ fields: ['reviewedAt', 'title'] }],
}).with({ review: 'editors' })
```

<!-- endregion -->

## Declare application operations

`defineOperation({ name, input, output, handler })` declares one application
operation without writing a plugin (ADR-0324). `input` and `output` are
Standard Schema validators (Zod, Valibot, ArkType…); install the result with
`UltimaBase.use(...)`. The operation is public: every installed transport
exposes it, REST at `POST /api/operations/<name>`. From the
[REST example](../../examples/rest/README.md):

<!-- region ../../examples/rest/src/operations.ts#operation -->

```ts
import { defineOperation } from '@ultimabase/plugin-kit'
import { z } from 'zod'

/**
 * An application operation without a plugin: REST validates the input with
 * `input`, the result with `output`, and describes both in OpenAPI.
 */
export const readingTime = defineOperation({
	name: 'readingTime',
	input: z.object({
		text: z.string().min(1),
		wordsPerMinute: z.number().int().positive().default(200),
	}),
	output: z.object({ minutes: z.number().int().positive() }),
	handler: ({ input }) => {
		const words = input.text.trim().split(/\s+/u).length
		return { minutes: Math.ceil(words / input.wordsPerMinute) }
	},
})
```

<!-- endregion -->

- The handler receives the validated input (the validator's output) and the
  request `context`; schema reads and writes inside it run with the caller's
  authority (`getRequestPrincipal(context)` reads the caller).
- Input the validator rejects is a `VALIDATION_ERROR` whose issues carry
  `code: 'operation.input'` and paths starting with `input`; a result the
  output validator rejects is a server error. Throw `PublicError` for an
  application error the client receives.
- Wire values are JSON; the result goes through `toJSON` like REST results.
- A validator implementing Standard JSON Schema (as Zod does) describes the
  operation in the REST OpenAPI document and types its GraphQL field (the
  [GraphQL example](../../examples/graphql/README.md)'s operation of the same
  name gives `readingTime(input: ReadingTimeInput!): ReadingTimeResult!`).
  `readStandardJsonSchema(validator, 'input' | 'output')` is the shared
  reading both transports use.
- `name` is a camelCase identifier; the Core operation is
  `application.<kebab-case name>`, owned by the `application.operations`
  plugin with the name as instance.

## Publish typed post-commit events

The event helpers remove the repeated contract, observer capability, and
transaction-journal plumbing shared by independent plugins. A producer defines
one versioned channel and consumes its optional requirement; observers retain
their own `runtime:observe` privilege and provenance. This sketch leaves out
the payload type and the audit sink:

```ts unverified
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

<!-- region ../../examples/plugin-authoring/tests/options.test.ts#schema-parser -->

```ts
const parseOptions = definePluginOptionsParser({
	name: 'workflow plugin options',
	schema: z.strictObject({
		instanceId: z.string().optional(),
		mode: z.enum(['review', 'publish']).default('review'),
	}),
})
```

<!-- endregion -->

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

<!-- region ../../examples/plugin-authoring/tests/options.test.ts#manual-parser -->

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

<!-- endregion -->

`formatUnknownKey` may preserve an established plugin-specific diagnostic when
migrating an existing manual parser; new plugins normally use the default
message. Plugin Kit depends only on the types-only `@standard-schema/spec`
protocol and never installs Zod or another concrete validator for consumers.

## Derive environment-dependent defaults

A plugin whose default depends on the deployment reads `NODE_ENV` in its
factory, never per request; Core never reads it (ADR-0312). The helpers keep
that rule in one place: `production` means production, any other value or
none means development, and an explicit option always wins.

<!-- region ../../examples/plugin-authoring/src/trace-plugin.ts#trace-plugin -->

```ts
import { contributeApplication, plugin } from '@ultimabase/core/plugin'
import {
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'

/** Verbose in development, quiet in production, unless an option decides. */
export const tracePlugin = (options: { verbose?: boolean } = {}) => {
	// Read once in the factory, never per request.
	const verbose = deriveEnvironmentDefault(options.verbose, {
		development: true,
		production: false,
	})
	return plugin({
		id: 'community.trace',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeApplication(({ logger }) => {
				logger.debug(
					`verbose ${String(verbose.value)} (${describeEnvironmentSource(verbose.source)})`,
				)
				return { exports: { verbose: verbose.value } }
			}),
		],
	})
}
```

<!-- endregion -->

Under Vitest (`NODE_ENV=test`) the plugin logs
`[community.trace] verbose true (NODE_ENV is not production)`.
`readDeploymentEnvironment()` returns `'development'` or `'production'`
directly. Log the derived value and its source at debug level through the
plugin logger (ADR-0313), never an option value or secret.

## Build common additive schema patches

`SchemaPatchBuilder` is immutable. Each call delegates to Core's nominal patch
factory and returns a new builder. The example's flag plugin adds a field and
an index to the schemas that set `flaggable: true`, inside its `schema`
declaration callback:

<!-- region ../../examples/plugin-authoring/src/flag-plugin.ts#flag-patch -->

```ts
schemas.patch(
	patchSchemas({
		targets: schemas.select({ option: { name: 'flaggable' } }),
		patch: schemaPatch()
			.addField({
				contributionId: 'flagged-field',
				name: 'flagged',
				field: flaggedField,
				mutationInput: 'forbidden',
			})
			.addIndex({
				contributionId: 'flagged-index',
				fields: ['flagged', 'createdAt'],
			}),
	}),
)
```

<!-- endregion -->

The builder covers additive fields, indexes, and plugin-owned schema or field
option values. ADR-0289 removed `addConstraint()` with Core's portable schema
constraints, which no production plugin consumed. These operations require the same
`schema:declare` privilege that Core would require
without the helper. Destructive replacement, rename, and removal patches are
not plugin powers; the helper does not reintroduce them. Core still validates
every patch's target, ownership, and provenance. `mutationInput: 'forbidden'` reserves an added stored
field for plugin-owned effects while keeping it selectable and physically
persisted; Core applies the same omission to Runtime validation, nested
writes, and transport inputs.

Presence selection never reads the direct option value, so the same ordinary
patch builder works for JSON configuration and opaque callback-bearing options.
Use `{ name, path?, equals }` only when structural JSON equality is required.

## Declare contextual fields and options

Plugin-owned field families and direct field options state exactly where they
work. Core owns the field family because it also owns Runtime registration;
Plugin Kit keeps only the option and output conveniences:

<!-- region ../../examples/plugin-authoring/src/rating-plugin.ts#rating-plugin -->

```ts
import { definePluginFieldFamily } from '@ultimabase/core'
import { contributeDeclarations, plugin } from '@ultimabase/core/plugin'
import {
	defineOutputDescriptor,
	definePluginFieldOption,
} from '@ultimabase/plugin-kit'

/** `output.rating()`: a virtual field's numeric result, in the output context only. */
const ratingFamily = definePluginFieldFamily({
	fieldKind: 'community.rating',
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
			},
		},
	},
})

/** `searchable: true` on a stored field, normalized to a boolean. */
const searchableOption = definePluginFieldOption({
	contexts: ['stored'],
	normalize: (value) => value === true,
	protocolVersion: 1,
})

export const ratingPlugin = () =>
	plugin({
		id: 'community.rating',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				// Returning the receipts types the builder method and the option.
				schema: ({ fields, schemas }) => [
					fields.register(ratingFamily),
					schemas.defineOptions({
						contributionId: 'rating-options',
						field: { searchable: searchableOption },
					}),
				],
			}),
		],
	})
```

<!-- endregion -->

An application that installs `ratingPlugin()` gets `output.rating()` in a
virtual field and the `searchable` option on stored fields:

<!-- region ../../examples/plugin-authoring/tests/field-kinds.test.ts#review -->

```ts
const Review = App.Schema.define({
	className: 'Review',
	fields: (f) => ({
		body: f.string({ required: true, searchable: true }),
		stars: f.int({ required: true }),
		score: f.virtual({
			output: (output) => output.rating(),
			select: { stars: true },
			resolve: ({ item }) =>
				typeof item.stars === 'number' ? item.stars * 20 : 0,
		}),
	}),
})
```

<!-- endregion -->

The closed contexts are `stored`, `embedded`, `virtual`, and `output`. A method
may provide a different factory and public callable type in each supported
context. Return the `fields.register(...)` and `schemas.defineOptions(...)`
receipts from the same Core declaration callback; `UltimaBase.use()` then infers the
exact application-local methods and field options without a Plugin Kit
registry. A stored representation does not automatically
grant embedded or output behavior, and Core rejects unsupported use before
setup even when JavaScript bypasses autocomplete.

## Contribute operations through Core

Operation authoring is foundational and no longer requires Plugin Kit. Core's
`contributeOperation()` correlates the token, handler, optional resource
cleanup, and optional wire bindings in one definition:

<!-- region ../../examples/plugin-authoring/src/workflow/operations.ts#operations -->

```ts
import { defineOperation, defineOperationValue } from '@ultimabase/core/plugin'

const text = defineOperationValue((value, path): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be text`)
	}
	return value
})

/** An app-wide command with no database work: it forbids a transaction. */
export const formatWorkflow = defineOperation({
	input: text,
	name: 'community.workflow.format',
	result: text,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
```

<!-- endregion -->

<!-- region ../../examples/plugin-authoring/src/workflow/plugin.ts#workflow-plugin -->

```ts
import { contributeOperation, plugin } from '@ultimabase/core/plugin'

import { formatGraphqlBinding } from './graphql-binding.ts'
import { formatWorkflow } from './operations.ts'

/** One owner declares, executes and publishes the operation. */
export const workflowPlugin = () =>
	plugin({
		id: 'community.workflow',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeOperation({
				bindings: [formatGraphqlBinding],
				execute: ({ input }) => input.trim(),
				operation: formatWorkflow,
				public: { name: 'formatWorkflow' },
			}),
		],
	})
```

<!-- endregion -->

Core derives the `operation:declare` privilege, the static declaration,
application provider, and owner-local identifier from the contribution, and
`transport:expose` from its binding. The contribution also accepts
`create(context) => ({ execute, dispose? })` when the handler needs application
capabilities or a resource.

When an operation declares `transaction: 'required'`, Core supplies the
transactional request engine; the handler must not open a redundant nested
transaction.

Transport publication remains explicit: the owner declares the operation
public with `public: { name }`, then every installed transport exposes it
(here the `formatWorkflow` GraphQL query field and
`POST /api/operations/formatWorkflow`), and a binding inside the contribution
requires `transport:expose`. `contributeOperationBinding()` keeps a binding
separate from its handler under the same exact operation owner; foreign
binding owners remain invalid.

## Declare schema mutations without another wrapper

Use Core's `defineSchemaMutation()` and `contributeSchemaMutation()` directly.
Core derives the mutation declaration and handler provider from one
contribution. In this sketch, `snapshotArchiveInput` validates the command's
input and `Post` is the schema the plugin extends:

```ts unverified
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

## Share the role protocol

Permission providers such as ACL and role providers such as Roles meet through
one capability without importing each other (ADR-0329). The contract lives here,
not in Core: `requestRoleResolverCapability`, its `RequestRoleResolver` value,
the `RequestRoleReference` subject (a Core `RequestSubjectReference<'role'>`),
`resolveRequestRoleReference()` and `requireCurrentRequestRoleResolver()`.
This sketch shows a provider and a consumer side by side; `context` and `role`
come from the request being decided:

```ts unverified
import { provideCapability } from '@ultimabase/core/plugin'
import {
	requestRoleResolverCapability,
	requireCurrentRequestRoleResolver,
} from '@ultimabase/plugin-kit'

// A role provider:
provideCapability(requestRoleResolverCapability, {
	contributionId: 'roles',
	create: () => ({ value: { hasRole: ({ role }) => role.value === 'editor' } }),
})

// A consumer, during a request; the call keeps the provider's attribution:
await requireCurrentRequestRoleResolver().hasRole({ context, role })
```

Without a provider, `requireCurrentRequestRoleResolver()` fails with
`PLUGIN_CAPABILITY_MISSING` and the capability's hint. It is built on Core's
generic `readCurrentCapabilityProvider(token)`.

## Static and Runtime boundaries

| Concern                         | Static declaration                      | Application/Runtime                            |
| ------------------------------- | --------------------------------------- | ---------------------------------------------- |
| Plugin identity and permissions | Core `plugin()` + one contribution list | Core validates before effects                  |
| Option fingerprint facts        | plugin-owned normalized safe values     | secrets and resources stay out                 |
| Schema patches                  | `schemaPatch` + `patchSchemas`          | Core applies owner-attributed operations       |
| Operations                      | Core-owned operation contribution       | handler materializes and executes through Core |

## When to use Core directly

Use `@ultimabase/core` directly for:

- capability definitions, providers, and requirements;
- Runtime middleware, protected constraints, and persistence rewrites;
- transport bindings and lifecycle;
- every privilege, owner, registry, Master, or security decision.

`plugin-kit` intentionally contains no generic registry, service locator,
privilege shortcut, authority helper, or adapter escape hatch.
