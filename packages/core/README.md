# @ultimabase/core

The complete foundational UltimaBase framework for Node.js.

Responsibilities:

- immutable schemas, built-in and plugin-defined fields, and type inference;
- canonical object reads plus immutable QueryBuilder and Operation AST builders;
- plugin-owned schema and field option compilation plus policy-neutral enforcement foundations;
- anonymous and trusted master request authority with plugin-owned typed values;
- isolated `UltimaBase` application instances;
- plugin definitions and global plugin graph;
- flat deterministic plugin normalization;
- versioned declaration and application capabilities;
- lifecycle phases;
- request engines, validation, transactions, generic Runtime behavior, and database contracts;
- the public `UltimaBase` application facade.

Core must never import a concrete database, server, transport, migration,
permission, authentication, cache, or jobs package. Those optional capabilities
remain plugins above this package.

## Internal domains

One package does not mean one monolithic source folder. The implementation keeps
explicit `schema`, `query`, and `runtime` domains alongside application
orchestration, plugins, capabilities, and errors. Internal folders are not exported
as package subpaths; every supported API comes from `@ultimabase/core`.

Detailed guides remain focused by domain:

- [Schema and fields](docs/schema.md), with practical [schema examples](examples/schema/README.md);
- [Query and Operation AST](docs/query.md);
- [request authority](docs/access.md);
- [Runtime, engines, transactions, and optional behavior](docs/runtime.md).

## Declare schemas

[ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md) defines the
only declaration form; no type generation step exists, and
[ADR-0339](../../docs/adr/0339-define-describes-with-configures.md) splits it
in two blocks. `define` describes the data model, with static values only:
the fields, their constraints and indexes, which Core owns, plus the features
that add something to the schema (fields, commands), such as
`softDelete: true` or `acl: true`. Relation targets are thunks. A final
non-generic `.with({ … })` describes how each plugin treats that schema: one
key per installed rule. Indexes are in `define` because a unique index decides
which fields identify a row, so it types `updateOne` and `upsertOne` targets,
and every adapter enforces indexes as Core data constraints, like `required`
or `indexed: 'unique'`. A plugin storage setting such as `postgres: { table }`
is in `.with`: it changes nothing your code can write. The tested
[modeling example](../../examples/modeling/README.md), a bookshop, shows the
form; its only plugin is the database:

<!-- region ../../examples/modeling/src/app.ts#factory -->

```ts
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * The configured factory declares every schema of the bookshop. Data modeling
 * is Core: the only plugin is the database, and `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts, not when it is imported.
 */
export const App = UltimaBase.use(postgresPlugin())
```

<!-- endregion -->

A shared enum names one type for several fields:

<!-- region ../../examples/modeling/src/genre.ts#genre -->

```ts
import { defineEnum } from '@ultimabase/core'

/** A shared enum: every field that uses it has the same `Genre` type. */
export const Genre = defineEnum('Genre', ['fiction', 'essay', 'poetry'])
```

<!-- endregion -->

Schemas reference each other through thunks, here an inverse relation and the
pointer it maps:

<!-- region ../../examples/modeling/src/catalog.ts#author,book -->

```ts
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		// Computed for each result that selects it, never stored. Inside
		// `fields`, dependency values are typed `unknown`: convert them.
		displayName: field.virtual({
			output: (output) => output.string(),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) =>
				`${String(item.firstName)} ${String(item.lastName)}`,
		}),
		// Inverse side: the books whose `author` pointer targets this author.
		books: field.relation({ target: () => Book, mappedBy: 'author' }),
	}),
})

/** One field of each built-in value kind, and two composite indexes. */
export const Book = App.Schema.define({
	className: 'Book',
	fields: (field) => ({
		title: field.string({ required: true }),
		isbn: field.string({
			description: 'ISBN-13 without hyphens',
			immutable: true,
			indexed: 'unique',
			required: true,
		}),
		author: field.pointer({ target: () => Author, required: true }),
		price: field.decimal({ precision: 10, scale: 2, required: true }),
		genre: field.enum({ values: Genre, required: true }),
		format: field.enum({
			values: ['paperback', 'hardcover', 'ebook'],
			default: 'paperback',
		}),
		tags: field.string({ list: true }),
		pages: field.int(),
		weightKg: field.float(),
		publishedOn: field.date(),
		published: field.boolean({ default: false }),
		cover: field.binary(),
		details: field.json(),
	}),
	indexes: [
		// An author never has two books with the same title.
		{ fields: ['author', 'title'], unique: true },
		// Serves "the latest books of a genre".
		{ fields: ['genre', 'createdAt'] },
	],
})
```

<!-- endregion -->

`.with` carries the rules; `.with({ relations: … })` is a Core rule that
filters reads through a relation (ADR-0328). A plugin feature, such as
`softDelete: true` in the [Soft Delete example](../../examples/soft-delete/README.md),
is a key of `define`, and the `indexes` of `define` may name the fields it
adds. `Customer` reuses one embedded shape twice:

<!-- region ../../examples/modeling/src/address.ts#address -->

```ts
import type { EmbeddedFieldBuilder } from '@ultimabase/core'

/** One reusable child shape for every address of a customer. */
export const addressFields = (field: EmbeddedFieldBuilder) => ({
	line1: field.string({ required: true }),
	line2: field.string(),
	city: field.string({ required: true }),
	countryCode: field.string({ required: true }),
})
```

<!-- endregion -->

<!-- region ../../examples/modeling/src/customers.ts#customer -->

```ts
export const Customer = App.Schema.define({
	className: 'Customer',
	fields: (field) => ({
		name: field.string({ required: true }),
		email: field.string({ required: true, indexed: 'unique' }),
		// Embedded objects belong to the customer: no id, no own lifecycle.
		shippingAddress: field.object({
			fields: addressFields,
			required: true,
			typeName: 'Address',
		}),
		previousAddresses: field.object({
			fields: addressFields,
			list: true,
			default: [],
			typeName: 'PreviousAddress',
		}),
		favoriteGenres: field.enum({ values: Genre, list: true }),
		// Owning side: the customer stores which books it wishes for.
		wishlist: field.relation({ target: () => Book }),
		// One call to the loyalty service resolves every customer of a read.
		loyaltyTier: field.virtual({
			output: (output) => output.string(),
			select: { email: true },
			resolveMany: ({ items }) =>
				loyaltyService.tiers(items.map(({ email }) => String(email))),
		}),
	}),
}).with({
	// Reads through `wishlist` only show published books.
	relations: { wishlist: { where: { published: { eq: true } } } },
})
```

<!-- endregion -->

The application lists its schemas and declares itself once in `Register`:

<!-- region ../../examples/modeling/src/ultimabase.ts#application -->

```ts
import { App } from './app.ts'
import { Author, Book } from './catalog.ts'
import { Customer } from './customers.ts'
import { Order } from './orders.ts'

export const ultimabase = new App({
	schemas: [Author, Book, Customer, Order],
	validation: {
		// Calendar values generated by `autoNow` follow the shop's timezone.
		timezone: 'Europe/Paris',
		// Bounds one nested create or update.
		nestedWrites: { maxDepth: 3, maxOperations: 50 },
	},
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

<!-- endregion -->

- `field.pointer` and `field.relation` accept `target: () => Schema`; Core
  captures the thunk type without resolving it, so schemas in separate files
  may reference each other. `mappedBy` of a thunk target is checked when the
  application is constructed.
- Plugins contribute features (keys of `define`) through
  `provideSchemaFeatures` and `PluginSchemaFeatureSource`, and rules (keys
  of `.with`) through `provideSchemaRules` and `PluginSchemaRulesSource`; Core
  accepts the declared rule names, plus its own `relations`, and never names a
  plugin. A rule a feature requires is a required key. `className`, `fields`, `indexes`,
  `relations` and `with` are reserved. `.with` must be the last call.
  `define` returns a `DeclaredSchema`.
- `define` records the features it sets (`this['shape']`). Plugins type what a
  schema gains through higher-kinded slots that Core evaluates against that
  record (ADR-0316): `SchemaFieldsHKT` returns the added fields (never reading
  the schema, so no cycle), `SchemaStaticsHKT` the added statics, typed with
  `SchemaCommands<this['schema'], { … }>`, and `SchemaRulesHKT` the `.with`
  keys, typed against the completed schema. A rules slot also reads
  `this['shape']`, so a rule may be offered only with its feature, and a
  feature declares the rules it requires (`SchemaFeature<…, 'acl'>` and
  `requires: ['acl']`): ACL's `acl: true` requires `.with({ acl: { default } })`
  (ADR-0321), checked as a required key of `.with`, at
  `new App({ schemas })` for a declaration without `.with`, and when the
  application compiles. Schema-level plugin options project no type of their
  own. `definePlugin` from `@ultimabase/plugin-kit` writes these slots for the
  common cases.
- `SchemaFactoriesHKT` and `provideSchemaFactories` add schema factories to
  the configured application, such as `App.RoleSchema` (ADR-0322). A
  factory receives `define(options, statics)`: the same declaration as
  `App.Schema.define` (`indexes` and feature keys included), with `statics`
  bound to every class it creates, and
  starts its declarations with `DeclaredSchemaShape<SchemaFactoryShape<'Name'>>`
  so its statics slot recognizes them.
- The `Register` declaration gives name-keyed types (`Model<'Todo'>`,
  `Item<'Todo'>`, `CreateInput<'Todo'>`, `Where<'Todo'>`, `Select<'Todo'>`).
  ADR-0297 makes it required.

`define(...)` rejects any other key, in the editor
(`access is not a key of define(): use className, fields, indexes, …`, the
list ending with the installed features) and at runtime
(`Unknown schema option: access`).

## Static schema compilation and relationship targets

`UltimaBase.Schema.define()` captures a synchronous field declaration without
registering it. Its local model, inputs, bootstrap filters, selections, and
results are inferred from the returned field map, and filters across schemas
resolve through the relation thunks and the `Register` declaration. The field
callback runs once
at definition time to capture inert builder calls; it receives no application,
adapter, or lifecycle state. `UltimaBase.compile()` first runs the pure,
synchronous `declare` callback of every plugin in dependency order, then
resolves every configured schema atomically before plugin setup or infrastructure
lifecycle work. Setup receives the resulting read-only schema registry; plugins
cannot register late schemas or field methods.

The complete candidate graph is validated before canonical metadata is published.
Publication retains compatible compiled records without repeating their validation;
an incompatible reused schema prevents publication of every new candidate.

Compilation alone is pure; the example's tests compile the application above
before anything starts:

<!-- region ../../examples/modeling/tests/compile.test.ts#compile -->

```ts
// Pure: no plugin setup, no connection, no active-application slot.
const compiled = ultimabase.compile()
```

<!-- endregion -->

`compiled.schemas` is the read-only registry (`compiled.schemas.get('Book')` is
`Book`), and the application stays `idle`.

Core-only declarations resolve their Runtime metadata immediately, so their
metadata is available without an application. A
declaration that uses configured plugin builder methods keeps its inert capture
until a compatible application resolves it; accessing unresolved Runtime
metadata first throws `SchemaCompilationError`. Neither path registers the
schema, reruns the callback, or mutates its exported class or prototype.
Applications, tests, and framework-owned schemas use the same map-returning
FieldBuilder declaration.
Every builder method delegates to the corresponding immutable field factory, so
structural validation, defaults, plugin-owned options, and adapter metadata keep
one implementation. Embedded builders use named context-specific option types.
They omit pointers, relations, portable `indexed`, system generation, and
database sequences while retaining defaults, immutability, lists, structural
normalization, and temporal `autoNow` behavior.

Returned values use a third, independent `OutputBuilder` contract. It exposes
the same value vocabulary where representation is meaningful, but only accepts
`description`, complete-value `nullable` (outputs are non-null unless they
declare `nullable: true`, ADR-0340), one-dimensional `list`, and the
representation options owned by a kind. It has no defaults, input requiredness,
immutability, indexes, generators, validation hooks, relationships, or storage
metadata. `output.object({ fields })` recursively preserves an exact readonly
object shape; each property is present, while its own descriptor decides whether
its value may be `null`. Schema declarations consume these descriptors through
`field.virtual({ output, select, resolve })`, or `resolveMany({ context, items })`
returning one value per item to resolve every row of one read in one call
(ADR-0325). A virtual field belongs to the
selectable result shape but not to persisted `SchemaItem`, mutation inputs,
filters, ordering, indexes, migrations, or adapter fields. Its flat `select`
names the persisted scalar, object, or pointer values required by its synchronous
or asynchronous resolver; Core always retains `id`. Runtime authorizes the
logical field before deriving a private persisted dependency projection, so
dependency-only values never reach result behaviors or transports. Resolvers
receive the exact request context and an immutable dependency item, execute in
deterministic batches of at most 16, and have their returned value structurally
validated before exposure. Mutation virtuals resolve before commit, while eager
pointer and relation targets use the same operation-local scheduler under their
own target policy; the included targets of several parents resolve in
parallel. See the
[virtual-field examples](examples/schema/virtual-fields.md) for primitive,
object, nullable, list, request-context, and asynchronous declarations.

When a mutation adapter returns that private persisted superset, the generic
mutation-outcome behavior input carries `selectedFieldsOverride`. It describes
only the exact adapter projection needed for structural validation; it never
changes the logical operation, public selection, Hook item, or final result.

Exact decimal fields keep storage-relevant shape as direct metadata:
`field.decimal({ precision: 12, scale: 2 })`. Core validates those options and
enforces them at Runtime, while adapters may inspect them without depending on
application policy.

Every built-in factory immediately rejects Core-owned root options that the
selected field kind does not support. Other unknown root properties are detached and retained until application compilation:
one exact installed plugin option descriptor validates and normalizes each used
property. Duplicate descriptor names remain harmless while unused; a developer
occurrence with no owner or several possible owners fails deterministically,
while a plugin-owned occurrence resolves against its exact plugin and instance.
Plugin-defined fields retain their native structural option keys.

The first mutation pass resolves defaults and generators and produces a
structurally trusted immutable operation. Optional behavior may then normalize
that typed input, after which Core always repeats structural snapshots before
value-dependent enforcement, observers, or persistence. Reads, adapter results,
mutation materializations, includes, and final projections retain the same Core
structural boundary.

Install [`@ultimabase/validation-plugin`](../validation-plugin/README.md) to add
the direct `validation` option and synchronous Standard Schema application rules.
Core neither publishes Standard Schema types nor allocates that optional behavior.

TypeScript reports invalid option combinations on the primary option contract.
For example, empty enum domains identify `values`, required pointers using
`onDelete: "setNull"` identify `onDelete`, and temporal generation conflicts
identify the corresponding `Defaulted*FieldOptions` contract. These diagnostics
never request a synthetic positional argument. Valid zero-argument calls and
option completion retain their compact factory signatures.

Exact developer and plugin-contributed field maps also reject names reserved by system
fields, Query logical operators, or retained model field names in TypeScript.
Those same canonical name declarations drive runtime checks for dynamic plugin
maps that cannot provide a sound literal-key guarantee.

Framework and plugin authors may still compose the immutable low-level field
factories internally. Application schemas use named builder methods; there is
no general application-facing `field.custom()`.

A plugin declares one application-local field family without making Core know
its semantics. The kind is written once; an optional builder names only the
supported contexts. In this sketch for plugin authors, `vectorField` is the
plugin's own field factory; the [pg-vector plugin](../pg-vector-plugin/README.md)
is a complete implementation:

```ts unverified
const vectorFamily = definePluginFieldFamily({
	fieldKind: 'pg-vector.vector',
	builder: {
		name: 'vector',
		contexts: { stored: { factory: vectorField } },
	},
})

const vectorPlugin = plugin({
	id: '@ultimabase/pg-vector-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		contributeDeclarations({
			schema: ({ fields }) => fields.register(vectorFamily),
		}),
		contributeApplication(() => ({ exports: { ready: true } })),
	],
})
```

Every builder names a non-empty subset of `stored`, `embedded`, `virtual`, and
`output`, with one exact factory per supported context.
Supporting a stored field never implies that the same value is safe inside an
embedded object or as an output descriptor. Output factories create their
descriptor with `definePluginOutputDescriptor()`; Core checks descriptor
provenance and the declared kind before accepting it. A context may override
the family's kind when one method intentionally represents different values in
different contexts.

Registrations are isolated per application and reject built-in overrides,
duplicates, unstable declarations, unsupported contexts, and factories
returning another field kind.
`declare` receives only exact capability reads and facades authorized by active
privileges; it receives no setup services or runtime state and must return
synchronously. Returning the registrar receipt lets the same static declaration
project the contributed method onto the configured factory created by
`UltimaBase.use()`. Only that application's matching stored, embedded, virtual,
or output builder receives the method; Core's zero-plugin builders do not expose
it globally. The receipt carries no Runtime state, so it creates no second
registry or effect. Calling a missing or context-incompatible method through
untyped or stale code still fails during static schema compilation before setup.

A plugin that contributes a reserved field through a schema patch can declare
its field kind without exposing a misleading builder method, as in this
sketch of its `declare` callback:

```ts unverified
const secretFamily = definePluginFieldFamily({ fieldKind: 'fixture.secret' })

declare({ fields, schemas }) {
	fields.register(secretFamily)
	// The plugin may now patch its `fixture.secret` field through `schemas`.
}
```

The registration is application-local: it creates no field and no Runtime
behavior.

### Plugin-owned schema compilation

When a package itself defines a specialized schema class, use the single
Core-native `Schema.defineSpecialized(options, createStatics)` boundary. Its
factory returns the static capabilities only; Core attaches them before freezing
the same ordinary schema identity. Results are plain data and never gain
methods (ADR-0310). Static string or private symbol keys are non-enumerable.
This low-level API
is for package-owned factories of specialized schemas. Ordinary
application schemas use `App.Schema.define()`.

The same owner-bound `schemas` facade lets an authorized plugin add stable
schema classes, declare direct schema and field option contracts, and
apply callback-free immutable patches. Every persisted contribution has one
stable `contributionId`; Core injects the exact plugin ID, optional instance ID,
package version, protocol version, and normalized static options into the final
schema provenance:

```ts twoslash
import { stringField } from '@ultimabase/core'
import {
	addSchemaField,
	addSchemaIndex,
	contributeDeclarations,
	defineSchemaOption,
	plugin,
} from '@ultimabase/core/plugin'

const workflowOption = defineSchemaOption({
	normalize(value, path) {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('enabled' in value) ||
			typeof value.enabled !== 'boolean'
		) {
			throw new TypeError(`${path}.enabled must be a boolean`)
		}

		return { enabled: value.enabled }
	},
	protocolVersion: 1,
})

export const workflowPlugin = plugin({
	id: '@example/workflow-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		contributeDeclarations({
			schema: ({ schemas }) => {
				const options = schemas.defineOptions({
					contributionId: 'workflow-options',
					schema: { workflow: workflowOption },
				})

				const workflowSchemas = schemas.select({
					option: { name: 'workflow' },
				})

				schemas.patch({
					targets: workflowSchemas,
					operations: [
						addSchemaField({
							contributionId: 'workflow-state',
							name: 'workflowState',
							field: stringField({ required: true }),
						}),
						addSchemaIndex({
							contributionId: 'workflow-state-index',
							fields: ['workflowState', 'createdAt'],
						}),
					],
				})

				return options
			},
		}),
	],
})
```

Because the option adds a field, the application sets it as a feature key of
`define` (`workflow: { enabled: true }`) once the plugin attaches it with
`provideSchemaFeatures`; the plugin types the field the patch adds through a
fields slot (`SchemaFieldsHKT`). An option that only configures behaviour is a
rule instead: `provideSchemaRules(instance, ['workflow'])` offers
`workflow` in `.with`, typed through a rules slot
(`SchemaRulesHKT`). Patches and schema-level option definitions project no
type of their own (ADR-0297, ADR-0339).

Use `schemas.add(...)` when the plugin supplies the schema class. Use
`schemas.claim({ contributionId, schema })` when application code supplies the
exact class in the root `schemas` list but the plugin must own its provenance
and transport visibility. Claims never register a missing class implicitly and
cannot target a schema also added by that plugin.

A selector is an inert immutable descriptor. Core evaluates every selector once
against the graph completed by earlier plugins, before applying any patch from
its current owner. A plugin therefore cannot make its own selection grow by
adding a matching field or schema first. Additions require `schema:declare`;
patches never replace, rename, or remove existing declarations. Option setters
reject existing values, and every addition retains its exact owner and contribution ID. Core schema identity and
system fields remain protected. `{ option: { name } }` checks only that the
normalized direct option occurs and therefore also supports opaque callback
values without exposing or invoking them. `{ option: { name, present: false } }`
selects only schemas that omit that direct option; an explicit `false` remains
present and does not match. `{ option: { name, path?, equals } }` keeps
structural JSON equality: object key order is irrelevant, while array order and
primitive identity remain exact. If the normalized value is nonportable (for
example, an object containing a callback), equality/path selectors do not match;
use presence or absence instead. They cannot inspect opaque contents or internal
markers. A portable normalized value still supports equality even when its
option definition permits opaque values. `present: true`, combinations of `present`
with equality or paths, and general selector negation are rejected. The option
name must still resolve to one exact definition. Contribution IDs are local to
the full `{ pluginId, instanceId? }` identity, so two explicit instances may
reuse the same local ID.

The Core compiler preserves all three option selector forms and checks their
meaning before publishing the compiled graph.

Direct plugin options use ordinary properties rather than a separate options
bag. Schema-scoped contracts use `defineSchemaOption()`. Field-scoped contracts
use `defineFieldOption({ contexts, ... })` and must explicitly list every
`stored`, `embedded`, `virtual`, or `output` location where their behavior can
execute. A field option's returned declaration receipt projects its exact
normalized source type only through configured factories that install the
plugin; schema-scoped options are typed by the plugin's features and `.with`
rules slot. No
ambient augmentation is required. Unused
definitions remain absent and therefore cannot create application-wide
TypeScript conflicts. JavaScript and stale declarations pass through the same
Runtime context checks.

A field kind's value representation and its field behavior are independent.
For example, a portable JSON codec can make a plugin value storable or
transportable, but it does not make an index, mutation validator, input Hook, or
database column option meaningful for embedded, virtual, or output contexts.
Plugin authors grant each method and direct option only the contexts backed by
its current implementation.

A factory-owned compiler marker, such as the identity marker a schema factory
inserts, is an ordinary option no rules slot types: Core still resolves,
normalizes, attributes, and compiles every occurrence, while developers never
see it in completions.

An option contract may also declare a Runtime compiler backed by one exact
application-lifetime capability requirement. Static compilation only records
the final normalized option occurrences, so `ultimabase.compile()` never
materializes infrastructure or invokes the compiler. During real
application initialization, Core materializes capabilities first, invokes each
used option compiler in plugin declaration and schema order, then starts plugin
`setup`. The compiler receives a frozen target context and its owner-bound
capability, must return `undefined`, and contributes behavior through that
capability rather than through a generic Core registry. Unused option contracts
run nothing; a compiler failure aborts initialization and disposes already
materialized capability resources.

Static compilation stages plugin schemas away from the public registry and
publishes the complete validated graph once. Registration, option, selector,
patch, or final validation failure therefore exposes no partial plugin schema
set. Every declaration failure uses `PLUGIN_DECLARATION_INVALID`, retains the
original cause and safe owner, contribution, and path diagnostics, and
permanently closes compilation, initialization, and startup for that application
instance.

`schema.definition.provenance` explains the final schema, fields, direct options,
indexes, and applied patches. Tooling and later migration bridges consume this
inert logical snapshot; removing a plugin
never authorizes Core to drop persisted data. Compilation registries are
application-local. Reusing one stable schema class succeeds only when its whole
final logical graph is compatible; a different installed plugin surface fails
without rebinding or cleaning the previously compiled class.

Framework tooling can call `ultimabase.compile()` to run exactly this
synchronous static phase without plugin setup or infrastructure. The method is
idempotent after success and rethrows the original failure after an unsuccessful
attempt. Editor types never depend on it: they come from the declarations and
the configured source factory (ADR-0297).

Core compiles developer schemas and authorized plugin contributions directly.
Its private immutable prepared schemas retain exact contribution owners,
selectors, additive patches and nominal domain objects without an intermediate
transport format. Before publishing the graph,
Core validates completeness, stable schema identity, provenance, portability,
application ownership, protected fields, and final relationships. Invalid or
mutable compilation output fails before plugin setup.

The compiler and Runtime executor are Core implementation boundaries. Plugins
extend them through the documented contribution APIs and cannot replace them.

Plugin setup receives the same compiled schema registry.

`UltimaBase.compile().operations` and `.schemaSurfaces` describe the canonical
commands for tooling. Operation entries retain their names, contracts and
owners, but omit input/result snapshot callbacks and are not executable
operation tokens. Each surface's `schema` is only `{ className }`,
not a schema constructor. Mutation aliases use the same compiled facts as direct
handles; their inspection Maps are detached from execution indexes. Keep original
declarations when authoring operations.

Pointer types correlate targets by their schema. Runtime values remain
ordinary `Pointer` instances. Plugin commands on a schema class are typed by
the plugin's statics slot (`SchemaCommands`, ADR-0316).

### Application-owned schema and operation handles

Plugin-created schemas and conditional public methods never mutate an exported
schema class or its prototype. Schema mutations may appear as inert static
dispatchers on the frozen class after application startup; each call still
selects one application's compiled surface. `ultimabase.schema(nameOrClass)` resolves one
cached handle from the final application graph. Stable classes preserve their
ordinary package-owned methods, while configuration-dependent schemas remain
available by runtime name in JavaScript. Native CRUD runs on the schema class,
including the class obtained from a dynamic handle's `.schema` property. The
same handle is returned for a class and for its name:

<!-- region ../../examples/plugin-authoring/tests/handles.test.ts#schema-handles -->

```ts
const Posts = ultimabase.schema(Post)
const Comments = ultimabase.schema('Comment')

const samePost = Posts.schema === Post
const commentClass = Comments.schema.className
const comments = await Comments.schema.findMany()
```

<!-- endregion -->

Custom operations are immutable namespaced SemVer tokens. Their input and
result contracts validate and detach untrusted values, while target and
transaction metadata stay transport-neutral:

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

The owner contributes the token with its handler, its optional wire bindings
and its optional public declaration:

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

`contributeOperation()` correlates the token, direct or resource-backed handler,
and optional wire bindings. Core derives the static registrar call, nominal
command plan, owner-local identifiers, and deterministic cleanup. Authors do
not register a separate handler or transport provider.
Core derives `operation:declare` and reports it with a generated reason. Then call
`ultimabase.operation(formatWorkflow).execute(input)`. Generic operations target
the application. Item-specific commands use the schema-mutation contract below.

Trusted server helpers can use `getCurrentUltimaBase()` to retrieve the facade
owning the active request, or the sole initialized application outside a
request, and resolve its ordinary `.operation(token)` handles. It fails with
`MISSING_EXECUTION_CONTEXT` when no application is active. The selected facade
retains its lifecycle and operation checks. Use `getCurrentEngine()` or
`getCurrentRequest()` when an exact request-local value is required; Core
exposes no second aggregate context API. Transports continue to use their
narrow request-execution capability.

`prepare()` validates one immutable logical envelope without I/O; `execute()`
enters the active `RequestEngine`, enforces cancellation and transaction policy,
invokes the exact owner handler, and validates the result. The compiled handler
remains a separate application capability internally and may throw only declared `PluginError`
codes as public domain failures. Codes use either a namespaced lowercase form
such as `community.workflow.rejected` or a stable constant identifier such as
`PASSWORD_AUTH_INVALID_SESSION`:

Reusable queries are ordinary functions over immutable Query builders. They
need no plugin registrar. Model views remain application-owned and immutable;
only native commands and installed schema-mutation methods appear on them.

Item-oriented workflow mutations use the separate `defineSchemaMutation()`
contract. They retain one logical mutation identity, a caller or Master
authority requirement, an update or delete effect family, a fixed before/after
result phase, and only the persisted dependencies needed by their future owner
resolver:

```ts twoslash
import { UltimaBase } from '@ultimabase/core'
import {
	contributeDeclarations,
	contributeSchemaMutation,
	defineOperationValue,
	defineSchemaMutation,
	plugin,
} from '@ultimabase/core/plugin'

const PostSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		workflowState: field.string(),
	}),
})

const snapshotArchiveInput = defineOperationValue(
	(value, path): { readonly reason: string } => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('reason' in value) ||
			typeof value.reason !== 'string'
		) {
			throw new TypeError(`${path}.reason must be text`)
		}
		return { reason: value.reason }
	},
)

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['community.workflow.archive-rejected'],
	input: snapshotArchiveInput,
	name: 'community.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.0.0',
})

const archiveContribution = contributeSchemaMutation({
	mutation: archive,
	resolve: () => ({ data: { workflowState: 'archived' } }),
})

export const workflowPlugin = plugin({
	id: 'community.workflow',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		archiveContribution,
		contributeDeclarations({
			models: ({ models }) =>
				models.extend(PostSchema, {
					contributionId: 'workflow-mutations',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema'] },
					},
				}),
		}),
	],
})
```

These declarations compile to callback-free descriptors and direct
application-owned methods. An installed schema mutation is also callable from
the frozen schema class through the sole active application. The
plugin-authoring example declares its `archiveOne` command with `definePlugin`
from `@ultimabase/plugin-kit`, which builds these declarations, and calls it on
the class:

<!-- region ../../examples/plugin-authoring/tests/schema-contributions.test.ts#archive-one -->

```ts
const archived = await Post.archiveOne({ id: post.id })
```

<!-- endregion -->

The class only dispatches to the selected application's compiled surface; a
same-class application without that mutation rejects the call. The owner's
statics slot (`SchemaCommands`) types the payload, projection, inclusion and
result; JavaScript sees the same methods from the compiled graph. The owner's `contributeSchemaMutation()` call
supplies the resolver directly, or creates an application-lifetime resolver
resource through `create`. The resolver sees only immutable `context`, `input`,
`originalItem`, and `target` values. Core validates its owner-only replacement,
keeps the logical `plugin-schema-mutation` identity through policy and behavior,
and compiles the final `update-one` or Master-only `delete-one` plan inside the
automatic transaction.

Shared Runtime callbacks expose that existing distinction through
`RuntimeLogicalOperationAst` and `RuntimeLogicalOperationKind`. A generic
before/after interceptor or monotonic policy can therefore narrow on
`kind === 'plugin-schema-mutation'` without casting. Adapter execution,
normalization, prepared CRUD transforms, and `RuntimePipeline.execute()` remain
restricted to native database operations; this typing does not merge the two
execution pipelines.

Behavior engines that consume a generic prepared-mutation callback can use
`readRuntimePreparedMutationRecords()` to recover Core-validated logical
records instead of maintaining a second record decoder. The helper preserves
an absent or singular-null target and returns an immutable target collection.
Complete adapter outcomes remain
validated by `createRuntimeBehaviorBoundaries().snapshotMutationOutcome()`.

Field-oriented behavior engines can use
`transformOperationFieldInputs(operation, visitor)` instead of maintaining a
parallel mutation decoder. Core visits normalized persisted create and update
values children-first, including embedded object lists and independent bulk
items. Returning `undefined` observes without replacement; any other return
value is written through immutable operation copies. The promise retains the
caller's exact operation type.

Optional engines can require the versioned
`applicationSchemaMutationSurfaceCapability` to inspect each application's
immutable callback-free mutation catalog. Core supplies that catalog only on
demand, prevents plugin replacement or decoration, and contains no Access or
Hooks vocabulary.

See the focused
[plugin schema mutation example](examples/schema/plugin-schema-mutations.md).

Core compiles both command kinds into one private graph. Pure compilation fixes
names, exact owners, contracts and ordered schema aliases without running
handler or binding factories. During application materialization, Core binds
handlers and codecs to those same records. Duplicate active handlers/bindings,
foreign owners and forged source tokens fail before plugin setup or consuming
transport planning; already-created resources are disposed on failure. Selected
schema mutations still require a handler when Runtime is assembled. Declared
mutations with no selected schema remain dormant. Disposal revokes private
binding access while static descriptions remain inert.

Transport exposure is a second explicit boundary. The operation owner requests
`transport:expose`, adds a nominal wire codec to the operation contribution's
`bindings` list (or uses `contributeOperationBinding()`), and the application selects a non-empty
allowlist with `ultimabase.exposeOperations({ transport, operations })`.
Version 1 of this generic protocol binds application-targeted operations;
schema targets remain directly executable through their owned handles. Wire
requests supply an already validated `RequestContext` and cannot select Master
authority or a raw adapter. Results may contain frozen plain schema results with
Core's usual detached field values, including native binary values. Mutable
ordinary operation containers remain invalid; transport codecs own
representation without fetching or widening those values.

Protocol identities are canonical by exact name and version, so an operation
owner and transport package can contribute compatible bindings without
importing one another. A binding may attach deeply snapshotted inert JSON
metadata whose meaning belongs solely to that transport. The fixed exposure
facade lists only each selected operation's name, version, declared public
errors, owner, and metadata; executable callbacks and protected Runtime state
remain private.

Transports that must compile a public shape before the engine exists require
`applicationOperationTransportPlanningCapability` during application
materialization. Its `plan({ transport, operations })` method selects the
canonical owner-validated bindings after exact-token, canonical-protocol and
`transport:expose` checks, returning only immutable inert descriptors. The planner is demand-installed,
Core-owned, non-replaceable, and invalid after application disposal. Actual
requests must still use the separately late-bound
`ApplicationRequestExecutor.exposeOperations()` facade; the planner cannot
decode, execute, or authorize anything.

An owner declares an operation meant for clients in its contribution:
`contributeOperation({ operation, execute, public: { name: 'login' } })`
(ADR-0324). `name` is a camelCase identifier unique in the application, from
which transports derive their route or field; optional `input` and `output`
JSON Schemas document the wire values. `plan({ transport })` without
`operations` lists every public operation in public-name order, so each
installed transport exposes the same set without a per-transport list; an
operation not declared public is never listed. A public operation without a
binding for the protocol uses Core's default one: the wire value goes to the
operation's own input contract, whose rejection is a `VALIDATION_ERROR` with
one issue at `['input']`, and the result is returned as is. Descriptors carry
`bound` and `public`. `ApplicationRequestExecutor.hasProtectedPolicy()` reports
whether a protected policy is installed, the generic signal a transport reads
to refuse public writes (ADR-0294).

Plugin-owned schema mutations use a separate binding family under the same
canonical transport identity. The mutation owner contributes one nominal
`schemaMutationWireCodec()` through the mutation contribution's `bindings`
list. The planner's
`planSchemaMutations({ transport })` method returns only callback-free,
schema-local descriptors; after startup,
`ApplicationRequestExecutor.exposeSchemaMutations({ transport })` returns the
matching application allowlist. A transport must execute an exact descriptor
from that allowlist with the route-selected application schema, ID, payload,
selection, inclusion, and `RequestContext`. Core alone decodes under owner
attribution and enters the schema-mutation Runtime. With
`bindings: 'optional'`, planning and exposure also include the request
commands on one row that have no binding for the protocol, decoded by their own
input contract; REST uses it to expose the commands an application names
(ADR-0324). Master-only and many-row commands never receive a default. Master authority cannot be
selected from wire input.

Planning and late execution share the exact frozen descriptors derived from the
canonical command and its materialized binding. Identity checks replace copied
metadata comparisons; descriptors alone still grant no execution authority.
A schema-mutation provider with no selected schema alias stays dormant
and contributes no transport descriptor or route. Its presence alone is not an
unused-binding startup error.

Core cannot prove complete transport coverage from arbitrary policy callbacks
and reports nothing about it (ADR-0325): a transport reads
`hasProtectedPolicy()` and refuses public writes without a policy unless the
application opts in (ADR-0294). An exposure only selects operations:

<!-- region ../../examples/plugin-authoring/tests/handles.test.ts#expose-operations -->

```ts
const exposed = ultimabase.exposeOperations({
	operations: [formatWorkflow],
	transport: graphqlOperationProtocol,
})
```

<!-- endregion -->

### Enter application requests from a transport plugin

Transport plugins require Core's `applicationRequestExecutionCapability` and
read it only from an application capability factory. Core materializes the
facade only when a plugin declares that requirement, then privately binds it
after engine construction. A factory retains its exact owner and callback
executor so later asynchronous route callbacks cannot inherit another plugin's
authority:

```ts twoslash
import { applicationRequestExecutionCapability } from '@ultimabase/core'
import {
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core/plugin'

/** The transport's own application-local API, read by its server adapter. */
const httpApplicationCapability = defineCapability<{
	readonly handle: (requestId: string) => Promise<string>
}>()({
	capabilityId: 'community.http-application',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

const requestExecution = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

declare const routeApplicationRequest: () => Promise<string>

export const httpPlugin = plugin({
	id: 'community.http',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		requestExecution,
		provideCapability(httpApplicationCapability, {
			contributionId: 'http-application',
			create: ({ callbacks, capabilities, owner }) => {
				const requests = capabilities.get(requestExecution)

				return {
					value: {
						handle: (requestId: string) =>
							callbacks.runPlugin(owner, () => {
								const context = requests.createAnonymousContext({
									requestId,
									source: 'community-http',
								})

								return requests.runWithContext(context, routeApplicationRequest)
							}),
					},
				}
			},
		}),
	],
})
```

`verifyMasterKey({ context, rawKey, reason })` is the only credential exchange
on this facade. It requires the exact active plugin instance to declare
`authority:elevate`, verifies and audits against the selected application, and
returns only its derived Master context. The raw key, authority, grant, engine,
adapter, and lifecycle controls never escape. Already verified owning Master
contexts may enter `runWithContext` and explicit operation exposures; foreign,
forged, stale, or wrong-authority contexts fail before request work.

`executeRead(context, operation)` accepts only a normalized Core schema-read
AST and returns its exact logical result through the same Runtime pipeline as a
direct Query. It preserves the bound context, cancellation, policy, inclusion,
materialization, and strict-target behavior without exposing a request engine,
application, adapter, or transaction facade.

A transport whose filter syntax mirrors Core can call
`transformQueryFilterInput(schema, wireWhere, transformOperand)` before
`normalizeReadOperation()`. Core recursively visits logical groups,
relationship predicates, filtered relation counts, and structured object paths;
the callback receives only the terminal field, operator, source, and raw value.
The transport therefore owns one scalar/list decoder and its own malformed-wire
errors instead of duplicating the recursive filter walker. This helper does not
validate operators or produce an AST: canonical Query normalization remains the
mandatory next boundary.

The matching mutation boundary is
`transformSchemaMutationDataInput(schema, wireData, options)`. Core classifies
persisted, virtual, and unknown fields, then follows nested pointer and relation
`create`/`update` target data. The transport's single `transformField` callback
retains scalar wrappers, identity decoding, command validation, and public
errors. The result is still untrusted command input: Core's ordinary schema
command and bounded nested-write normalization remain mandatory.

`executeMutation(context, schema, request)` accepts only the closed set of
schema create, update, delete, upsert, and homogeneous bulk commands. It
delegates to the same schema-command normalizers as direct class calls. The
facade therefore cannot execute an arbitrary AST or control transactions, while
bulk commands retain their ordered itemized all-or-nothing semantics.

REST and GraphQL read `hasProtectedPolicy()` and refuse public writes without
a policy (ADR-0294, ADR-0325). Execution is available only after the whole
application has started and expires on stop or disposal. Core intentionally
defines no self-asserted complete-coverage boolean; such a protocol requires
independently specified executable proof semantics.

Core preserves stable token input and result precision, stable schema-class
precision, and safe dynamic JavaScript access.

Pointer and relation declarations name their target lazily, with a thunk
(`target: () => Author`) or a registered class name, so schemas may reference
each other in any order. Static compilation resolves those targets after
every schema has been registered, then publishes one immutable graph owned by
the application, listed by `ultimabase.compile().schemas`.

`field.pointer()` declares one object reference while preserving the exact
target class in every model, like `Book.author` above. A read returns the
pointer, never its target:

<!-- region ../../examples/modeling/tests/relationships.test.ts#read-pointer -->

```ts
const book = await Book.findOneOrThrow({
	where: { id: { eq: id } },
	select: { author: true },
})
const author = await Author.findOne({
	where: { id: { eq: book.author.id } },
	select: { lastName: true },
})
```

<!-- endregion -->

`Pointer<TSchema>` contains only immutable logical schema identity and an object
ID. It never loads the target. `Author.pointer(id)` is the only way to
create one (ADR-0314): the constructor is not public, and `new Pointer(...)`
throws a `TypeError` pointing to `Schema.pointer(id)`. `Pointer` stays exported
for annotations, including `Pointer<"User">` for a registered class name, and
for `instanceof Pointer` checks.
Pointers serialize to `{ type: "pointer", className, id }` and compare by exact
schema identity plus ID. A `Pointer` is a value for filters, comparisons and
ACL entries; mutation data links rows only through `{ connect: target }`, where
the target is an ID or a `Pointer` of the declared target already in hand
(`{ connect: post.author }`), and `null` unlinks an optional pointer. A raw
`Pointer` or ID assigned to a pointer field is a type error and a
`VALIDATION_ERROR` whose message shows `{ connect: id }` (ADR-0308).

Pointers participate in reads without revealing physical foreign-key names.
Equality and membership predicates accept target object IDs directly; the
equality shorthand (`where: { author: authorId }`) also accepts a `Pointer` of
the declared target (ADR-0307). Ordered and string comparisons are rejected.
Target traversal stays explicit and target-typed:

<!-- region ../../examples/queries/src/reads.ts#pointer-filter -->

```ts
export const readPostsOfVerifiedAuthor = (authorId: string) =>
	Post.findMany({
		where: {
			author: {
				eq: authorId,
				is: { verified: true },
			},
		},
	})
```

<!-- endregion -->

`eq` compares only the stored pointer identity. `is` and `isNot` query fields
of the visible target and therefore apply installed target policies. Pointer
nullability uses `null` (the shorthand of `isNull: true`) or `isNull` and
`isNotNull`. A pointer does not read its target (ADR-0310): read it with
`Author.findOne({ where: { id: pointer.id } })`, which returns `null` for a
missing or row-filtered target; explicit policy denials, callback errors, and
adapter errors still fail the operation. Meanwhile,
bounded single-target inclusion is selection-aware:

<!-- region ../../examples/queries/src/reads.ts#post-context -->

```ts
export const readPostsWithContext = () =>
	Post.findMany({
		include: {
			author: { select: { displayName: true } },
			comments: {
				take: 3,
				orderBy: { createdAt: 'desc', id: 'asc' },
				select: { body: true },
				where: { published: { eq: true } },
			},
		},
		select: { title: true },
	})
```

<!-- endregion -->

An included pointer accepts only `select` and nested `include`: the pointer
already identifies at most one target, so inclusion cannot conditionally filter
it. Installed target policies still apply and may make an inaccessible pointer `null`.

`select` is flat and schema-correlated. Any `true` flag selects only the fields
marked `true`; an object containing only `false` flags selects every other
field. `{}` keeps the complete result shape. Every returned result always
contains `id`, including nested pointer and relation results, so an explicit
selection adds it implicitly. `id: false` is rejected rather than silently
ignored. Relationship result shaping stays explicit through `include`.

Runtime evaluates installed target policies, applies their row filters, and validates
selected targets. Inclusion does not manufacture a target schema lifecycle;
reads expose no official schema Hooks lifecycle. PostgreSQL loads the
prepared tree through Drizzle relational `with`. Missing or inaccessible
pointer targets become `null`; a relation contains only its visible targets and
therefore becomes an empty array when none remain. Nested inclusions use the
same rules. When installed, official field Access receives the field's declared `Pointer`
value; only the result returned to the caller is hydrated.

When installed, official field Hooks may normalize pointer input and official
field Access owns pointer disclosure. Field definitions and transports own output representation.
`relationField` remains a handle-only
declaration and accepts no official field Hooks.

The target ID used by pointer reads and inclusion is a private Runtime row
filter. It never enters the developer AST, so application query options can
neither inspect nor remove it. A target read inherits the active request;
outside one, it resolves the sole application and accepts the same
`{ context, useMasterKey }` authority options as every schema-root read.

`onDelete` defaults to `restrict`; `cascade` and optional-pointer `setNull` are
explicit alternatives. `indexed: "unique"` declares a one-to-one pointer.
Pointer lists and defaults are rejected so relationship writes stay explicit;
to-many collections use `relationField` instead. Physical foreign keys are
implemented by database plugins. An adapter serving schemas with pointer fields
must advertise the exported versioned
`databasePointerCapability`; setup fails before execution when it does not.

`relationField({ target })` declares the owning side of a to-many relationship.
An inverse names one exact pointer or owning relation on its target through
`mappedBy`:

<!-- region ../../examples/modeling/src/catalog.ts#author -->

```ts
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		// Computed for each result that selects it, never stored. Inside
		// `fields`, dependency values are typed `unknown`: convert them.
		displayName: field.virtual({
			output: (output) => output.string(),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) =>
				`${String(item.firstName)} ${String(item.lastName)}`,
		}),
		// Inverse side: the books whose `author` pointer targets this author.
		books: field.relation({ target: () => Book, mappedBy: 'author' }),
	}),
})
```

<!-- endregion -->

`Author.books` represents one-to-many storage through `Book.author`. An
owning relation plus one inverse relation represents many-to-many storage, while
one-to-one remains `pointerField({ indexed: "unique" })`. Relation fields are
root-level schema declarations and never appear in `InferObject`, create input,
update input, validation values, or an ordinary result without `include`.

A relation may define one target-typed read subset with `.with({ relations: … })`
in `.with`, keyed by relation field name (ADR-0328). `.with`
receives the complete schemas, so two schemas may filter each other's
relations. The static form uses the same portable filter vocabulary as an
ordinary target Query. The contextual form receives only the immutable request
context and an empty, target-typed `WhereBuilder`; it is synchronous and may
return either that builder or an exact target `WhereInput`. The `relations`
rule of the full-stack example's `ExampleArticle` uses both:

<!-- region ../../examples/full-stack/src/schema.ts#relation-views -->

```ts
// Narrows every read through these relation fields (ADR-0328).
relations: {
	contributors: { where: { listed: { eq: true } } },
	// Anonymous requests see only public reviewers.
	reviewers: {
		where: ({ context, where }) =>
			context.getValue(authPrincipal) === undefined
				? where.eq('audience', 'public')
				: where,
	},
},
```

<!-- endregion -->

`RelationRule<typeof Comment>` types one rule declared as a constant. A name
that is not a relation field of the schema, an unknown rule key or a malformed
filter fails when `.with` runs; a schema without relation fields has no
`relations` key. A plugin that adds a relation with
`addSchemaField(relationField(...))` cannot filter it.

Relation shaping is always combined with the caller's filter through logical
`AND`; it never grants access or replaces Access, ACL, or protected constraints.
Master does not bypass it unless the declaration explicitly returns an empty
filter for Master. The callback remains private Runtime behavior and never
enters adapter requests or transport metadata.

Reads may explicitly include the collection with an independently shaped target
query:

<!-- region ../../examples/queries/tests/relations.test.ts#included-page -->

```ts
// Each post's comments are paged on their own, like a root `findMany`.
const post = await Post.findOneOrThrow({
	where: { id },
	include: { comments: { orderBy: { body: 'asc' }, take: 2 } },
})
const last = post.comments.at(-1)
const next = await Post.findOneOrThrow({
	where: { id },
	include: {
		comments: {
			orderBy: { body: 'asc' },
			take: 2,
			...(last === undefined ? {} : { after: last }),
		},
	},
})
```

<!-- endregion -->

Unlike a pointer, an included relation supports `where`, `orderBy`, `skip`,
`take`, `after`, `select`, and nested `include`. Its `skip` and `after` apply
independently to every parent collection, `after` with the same keyset rules as
a root `findMany` (the order is completed by `id`; `after` and `skip` are
exclusive). Installed source-relation field policy runs once
before loading. Target policy and output resolution still apply through the
target read pipeline. The relation's declared `where` narrows that same
target collection before ordering, `skip`, and `take`. Core resolves a contextual
declaration once per exact field and root operation, even when one inclusion
hydrates many parents or repeats through a mutation result projection.

Results have no relation handles (ADR-0310): read a to-many collection with
`include` as above, or filter its parents through a relation filter
(`{ posts: { some: { published: { eq: true } } } }`).

Queries and writes follow Prisma's vocabulary (ADR-0307). In every `where`
input (reads, mutation targets, relation filters, Access rule objects, REST
`where` JSON, partial-index predicates), a value that is not a plain object on
a non-list scalar, enum or pointer field means `eq`, and `null` means
`isNull: true`: `where: { id }`, `where: { completed: false }`. List, `json`,
`object` and relation fields keep explicit operators, and normalization
produces the same canonical filter, so serialization and adapters are
unchanged; GraphQL filter inputs keep `{ eq }`. An operand of a `uuid` field,
or a pointer's target id, must be a UUID: a malformed one never reaches the
database and fails as malformed input naming its path
(`where.id.eq must be a valid UUID`). `findOneOrThrow` takes the
input of `findOne` and fails with `NOT_FOUND`, also for a hidden row, where
`findOne` returns `null`. In update data, a numeric field takes
`{ increment: n }` or `{ decrement: n }` with an operand of its value type, and
`null` clears an optional field.

Collection reads page with `take` and `after` (ADR-0309). Core completes
every `findMany` order with `id` ascending unless `id` is already ordered, and
`after` is the last row received from a read of the same shape:

<!-- region ../../examples/queries/tests/pagination.test.ts#after -->

```ts
const page = await Post.findMany({
	orderBy: { title: 'desc' },
	select: { id: true, title: true },
	take: 2,
})
// `after` is the last row received; there is none after an empty page.
const last = page.at(-1)
const next = await Post.findMany({
	orderBy: { title: 'desc' },
	select: { id: true, title: true },
	take: 2,
	...(last === undefined ? {} : { after: last }),
})
```

<!-- endregion -->

Core reads the ordered fields and `id` from that row, validates them, and turns
them into an ordinary caller filter combined with `where` by `AND`: policies
see every ordered field as filtered, and a hand-written position grants nothing
a filter could not. A row missing an ordered field fails with
`VALIDATION_ERROR` and `publicDetails: { parameter: 'after' }`. Ordered fields
must be non-list scalar or enum fields (other `orderBy` keys fail to compile,
ADR-0332), and `null` sorts last in both directions. `skip` skips rows instead and cannot be combined with `after`.

Server-side reads have no default `take`: without `take`, `findMany` returns
every matching row. The transport limits
(`pagination: { defaultTake, maxTake }` of the REST and GraphQL plugins) apply
only to their clients. Read a large table in batches with `after`:

<!-- region ../../examples/queries/src/reads.ts#batches -->

```ts
/** Reads every comment, 500 at a time, in `id` order. */
export const countCommentWords = async () => {
	let words = 0
	let after: Awaited<ReturnType<typeof Comment.findMany>>[number] | undefined
	do {
		const page = await Comment.findMany({
			take: 500,
			...(after ? { after } : {}),
		})
		for (const comment of page) words += comment.body.split(/\s+/u).length
		after = page.at(-1)
	} while (after)
	return words
}
```

<!-- endregion -->

Ordered scalar filters include explicit inclusive ranges. `between` keeps
values inside the interval, while `notBetween` keeps values strictly outside
it. Both remain first-class
transport-neutral AST nodes rather than expanding into logical branches.

One-dimensional field lists expose exact element-aware filters, shown here
beside a range, its complement and a portable regular expression:

<!-- region ../../examples/queries/tests/filters.test.ts#operators -->

```ts
const ranged = await Post.findMany({
	where: { views: { gte: 100, lt: 1_000 } },
})
const outside = await Post.findMany({
	where: { views: { notBetween: { lower: 100, upper: 999 } } },
})
const matching = await Post.findMany({
	where: {
		title: { matches: { source: '^ultima', flags: ['case-insensitive'] } },
	},
})
const tagged = await Post.findMany({
	where: { tags: { hasEvery: ['backend', 'typescript'] } },
})
const emptyTags = await Post.findMany({ where: { tags: { isEmpty: true } } })
const noTags = await Post.findMany({ where: { tags: { isNull: true } } })
```

<!-- endregion -->

`eq` and `ne` compare the complete list, `has` tests one element, and
`hasSome`/`hasEvery` test candidate sets. `isEmpty: true` applies only to a
non-null empty list; `isNull` and `isNotNull` retain complete-value nullability
semantics. Multidimensional data uses `jsonField()` and its structural
filters instead of typed list operators.

Structured filters use the same flat vocabulary for dynamic JSON and typed
objects. Object containment accepts recursive partial values, and object keys
and paths retain exact autocomplete:

<!-- region ../../examples/queries/src/reads.ts#structured -->

```ts
export const readPublicPosts = () =>
	Post.findMany({
		where: { metadata: { contains: { visibility: 'public' } } },
	})

export const readAuthorsByContact = (email: string) =>
	Author.findMany({
		where: { profile: { at: [{ path: ['contact', 'email'], eq: email }] } },
	})
```

<!-- endregion -->

`at` keeps segments separate in the Query AST, so dots inside declared field
names are never parsed as paths. A `jsonField` accepts dynamic string
segments and safe `JsonValue` operands. An `objectField` rejects unknown paths,
keys, values, and unsupported terminal operators in TypeScript. Paths cannot
traverse list fields. Embedded object children are stored values, so pointer and
relation fields and auto-incremented integer sequences must remain top-level
schema fields. Since persisted typed objects contain every declared key,
their root key checks are normally redundant; the same operators are primarily
useful for dynamic JSON branches.

Each database adapter declares the operators it executes per field
family (`filterOperators`); Core rejects any other operator with a public
`VALIDATION_ERROR` naming the field and operator before the adapter runs, and a
protected filter with an undeclared operator with a generic message. `matches`
accepts only the portable regular-expression subset of ADR-0302.

Relation membership changes through link commands in `updateOne` data, without
join-row commands (ADR-0308):

<!-- region ../../examples/queries/src/nested-writes.ts#revise-graph,replace-links -->

```ts
export const revisePostGraph = (
	postId: string,
	commentId: string,
	oldCommentId: string,
) =>
	Post.updateOne({
		data: {
			author: { update: { displayName: 'Ada Lovelace' } },
			comments: {
				create: [{ body: 'Third' }],
				update: [{ data: { body: 'Edited' }, id: commentId }],
				disconnect: [oldCommentId],
			},
		},
		where: { id: postId },
	})

/** Replaces the visible comments and unlinks the optional author. */
export const detachPost = (postId: string, keptCommentIds: readonly string[]) =>
	Post.updateOne({
		where: { id: postId },
		data: { author: null, comments: { set: [...keptCommentIds] } },
		select: { author: true },
		include: { comments: { select: { body: true } } },
	})
```

<!-- endregion -->

Each update uses the source schema's update Access and hook lifecycle, validates
target visibility, and joins the active or automatic transaction. Inverse
pointer relations execute ordinary target pointer updates through the same
Runtime. Adapters must advertise the versioned relation capability; PostgreSQL
implements scoped reads and atomic edge storage, while unsupported adapters
still fail closed.

Source Queries filter to-many relationships through the exact target schema:

<!-- region ../../examples/queries/src/reads.ts#relation-filters -->

```ts
export const readEstablishedAuthors = () =>
	Author.findMany({
		where: {
			posts: {
				count: { gte: 3, where: { published: { eq: true } } },
				some: { published: { eq: true }, views: { gte: 80 } },
			},
		},
	})
```

<!-- endregion -->

`some`, `none`, and `every` create immutable portable Query AST nodes from exact
nested `WhereInput` values. `count` compares a visible relation as a non-null
integer through `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `between`,
or `notBetween`; operands must be non-negative safe integers. Its optional
target-typed `where` filters the related objects before every comparison, and at
least one comparison is required. Runtime evaluates every installed target
policy filter and the relation's declared `where` into one private adapter
scope that behavior cannot inspect or remove. The declaration first defines the
visible relation universe; the caller's nested predicate then narrows that
universe for quantifiers or filtered counts. Predicate depth includes nested
declaration expansion. Core also limits each operation to 64 relation predicate
occurrences, including private predicates contributed by declarations and
policies, before any adapter work. Adapters must advertise the separate
versioned relation predicate capability before execution.

A to-many relation is never nullable. Use `isNotEmpty: true` to require at least
one visible related object and `isEmpty: true` to require an empty visible
collection; `isNull` and `isNotNull` are reserved for stored fields. These
explicit flags normalize to `some: {}` and `none: {}` so adapters retain their
optimized existence predicates. `every` is true for an empty visible
collection, so combine it with `isNotEmpty: true` when at least one target must
exist.

`count: { eq: 0 }` and `count: { gt: 0 }` are valid, but `isEmpty: true` and
`isNotEmpty: true` remain the clearer and cheaper existence forms. Multiple
count comparisons, including a filtered count, reuse one cardinality
calculation rather than issuing one query per operator or parent object. Eager
inclusions, emptiness, quantifiers, and counts therefore
agree on the same request-local visible targets before inclusion pagination.

When an edge owns application data, model it as an ordinary schema with two
pointer fields instead of hiding metadata behind `relationField`:

```ts twoslash
import { UltimaBase } from '@ultimabase/core'

const Member = UltimaBase.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const Project = UltimaBase.Schema.define({
	className: 'Project',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

export const Membership = UltimaBase.Schema.define({
	className: 'Membership',
	fields: (field) => ({
		member: field.pointer({ target: () => Member, required: true }),
		project: field.pointer({ target: () => Project, required: true }),
		role: field.enum({ values: ['editor', 'viewer'], required: true }),
	}),
	indexes: [{ fields: ['project', 'member'], unique: true }],
})
```

This explicit edge receives the same inference, read, Access, hook,
transaction, index, and referential behavior as any other schema. Use it when
the relationship has fields or its own lifecycle; keep an implicit owning
`relationField` for metadata-free set membership. See the
[complete relationship example](examples/schema/explicit-relationships.md).

Invalid, throwing, unregistered, and foreign targets fail before infrastructure
connects with the source class and field path. The graph contains logical class
identities only and no database or transport metadata.

## Plugin-owned request identity

Core has no User schema, session resolver, or authenticated-user authority
mode. Applications work with anonymous and audited master authority until an
optional plugin derives typed values on an immutable request context:

<!-- region ../../examples/queries/src/request-identity.ts#tenant-context -->

```ts
import {
	RequestContext,
	RequestContextValue,
	requestSources,
} from '@ultimabase/core/plugin'

export const tenantId = new RequestContextValue<string>(
	'acme.identity.tenant-id',
	(value: unknown) => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('Tenant id must be a non-empty string')
		}
		return value
	},
)

const anonymous = RequestContext.anonymous({
	requestId: 'request-123',
	source: requestSources.internal,
})

export const scoped = anonymous.withValue(tenantId, 'tenant-42')
export const currentTenant = scoped.getValue(tenantId) // string | undefined
export const authorityMode = scoped.access.mode // 'anonymous'
```

<!-- endregion -->

The token owns validation and snapshotting. Matching token names do not share
identity, adding the same token twice fails, and neither context derivation nor
transport data can manufacture master authority. Product plugins may expose
narrower callback contexts with the same typed read boundary without exposing
`withValue()`.

Permission providers may also consume optional subject capabilities without
importing a concrete authentication plugin. Dynamic principals use
nominal `RequestContextValue<T>` identities. An authentication provider may
publish one exact current principal without becoming a Core dependency:

```ts unverified
provideCapability(requestPrincipalResolverCapability, {
	contributionId: 'authenticated-principal',
	create: () => ({
		value: {
			resolveCurrent: ({ context }) => context.getValue(authenticatedPrincipal),
		},
	}),
})
```

The capability is `single`: a second provider fails at startup. Core resolves
the current principal at most once per request context
(`getRequestPrincipal(context)`)
and rejects forged Pointers and schemas not owned by the application. Nested,
hook-issued and transactional operations inherit it, and Master elevation keeps
it: authority changes, identity does not. An absent provider or absent
request-local identity gives `undefined`; neither creates authenticated
authority. `context.withPrincipal(pointer)` names the principal of a context
explicitly (server-side only), and `Register` types it by name
(ADR-0304):

<!-- region ../../examples/queries/src/ultimabase.ts#register -->

```ts
// One declaration per application gives name-keyed editor types;
// `principal` names the schema a request principal points to.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
		readonly principal: 'Author'
	}
}
```

<!-- endregion -->

Consumers receive it as `principal` and never import the provider: Access
rules, the Hooks `context.principal`, ACL callbacks, Roles and GraphQL
`execute({ principal })`. A `PolicyPredicate` is a named, side-effect-free
`({ principal, operation, schema }) => boolean | Promise<boolean>` decision
that policy plugins accept wherever a rule returns a decision without a
filter; Core exports `isAuthenticated`. A predicate that throws rejects the
operation.

`ultimabase.can({ principal, operation, schema, item })` asks whether an
operation would be permitted without executing it (ADR-0305). It evaluates
every installed policy as at execution time, runs no hook, input resolution,
validation, write or event, and ignores field rules; policies recognize its
operations with `readPolicyQuery(operation)`. `principal` defaults to the
current request's principal. With `item`, create checks run on the candidate
data, and other operations read the row named by `item.id` in a rolled-back
transaction: a missing or hidden row answers `false`. A `PERMISSION_DENIED` or
`PublicError` answers `false`; other errors propagate. Master is always
permitted.

A plugin that reads a protocol another plugin provides declares an optional or
required capability requirement; at request time it may also read the active
application's provider with `readCurrentCapabilityProvider(token)` from
`@ultimabase/core/plugin`, whose `run(callback)` keeps the provider's privilege
attribution. Core validates requirements before capability materialization and
plugin setup, so provider configuration order is irrelevant. Role protocols
live in `@ultimabase/plugin-kit`, not in Core (ADR-0329).

## Read and mutation execution authority

Every schema read resolves authority only when it executes. Inside an
active request, transaction, or hook it inherits that exact engine. Root jobs
resolve the sole initialized application, while an authentication or tenant
plugin may supply an already-derived context:

<!-- region ../../examples/queries/src/jobs.ts#read-for-job -->

```ts
import { RequestContext, requestSources } from '@ultimabase/core/plugin'

import { Post } from './schema.ts'

export const readPostsForJob = (requestId: string, signal: AbortSignal) => {
	const context = RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
		signal,
		metadata: { job: 'daily-report' },
	})

	return Post.findMany({ take: 20 }, { context })
}
```

<!-- endregion -->

Trusted backend code may request audited master authority in the same final
option position. Combining both elevates the supplied context and preserves its
typed values:

<!-- region ../../examples/queries/tests/master.test.ts#context-and-master -->

```ts
const context = RequestContext.anonymous({
	requestId: 'import-1',
	source: requestSources.internal,
}).withValue(tenantId, 'tenant-42')

const imported = await Announcement.createMany(
	{ data: [{ title: 'Imported one' }, { title: 'Imported two' }] },
	{ context, useMasterKey: true },
)
```

<!-- endregion -->

Every read and mutation accepts the same `OperationOptions` authority boundary.
`useMasterKey` is a boolean (ADR-0311): `false` is identical to omitting it,
inherits the current authority and never downgrades a Master context, so a
conditional elevation stays one call. Any other value is rejected before
execution. The value must come from server-side state, never from request
input:

<!-- region ../../examples/queries/tests/master.test.ts#conditional -->

```ts
const attempt = Announcement.createOne(
	{ data: { title: 'Nightly report' } },
	{ useMasterKey: isScheduledJob },
)
```

<!-- endregion -->

The application-owned `MasterAuthority` audits the operation before it runs;
the first configured key ID labels trusted operation elevations. Contexts and
authority flags never enter Query or Operation ASTs, and transports must not
map client input into these server-only options.

Only the application execution shell creates Master contexts. A
`MasterAuthority` verifies credentials and returns opaque grants, but it has no
public context-minting method. An explicit Master context is accepted only by
the exact application and authority that issued it; contexts from another
application remain invalid even when sequential applications reuse one authority
object. Public grants become bound to their issuing engine or first consuming
application; obtain a fresh grant for a replacement application. A plugin callback initiating a new elevation must declare the exact
critical `authority:elevate` privilege. That privilege suffices without a
configured `masterAuthority` (ADR-0326): Core then elevates through an
application-local authority with no exposed key and records each elevation as
a `debug` line of the application logger; application code still requires a
configured authority. Inheriting a Master context already
selected by trusted server code does not create another elevation or audit.

## Automatic mutation transactions

Every root create, update, upsert, and delete operation automatically uses the
configured database adapter's transaction lifecycle. Developer code keeps the
same concise API:

<!-- region ../../examples/queries/src/writes.ts#create-post -->

```ts
export const createPost = (authorId: string, slug: string, title: string) =>
	Post.createOne({
		data: {
			author: { connect: authorId },
			slug,
			title,
		},
		include: { author: { select: { displayName: true } } },
		select: { published: true, slug: true, title: true },
	})
```

<!-- endregion -->

The complete current Runtime mutation pipeline and database work started inside
it commit or roll back together. Configured schema, field, and plugin behavior executes
inside this same active boundary. An explicit
`ultimabase.transaction(fn)` (ADR-0311) runs `fn` in one adapter transaction
and resolves to its result; it keeps the current request (principal and
authority included) or opens a fresh anonymous internal one, is never
retried, and fails with `TRANSACTION_ERROR` inside another transaction. Root
mutations inside it reuse it without nesting, while root reads remain
non-transactional. Collection mutations are ordered singular item
operations inside one transaction: any missing target, input, persistence,
business-hook, or finalization failure rolls back the complete batch.

<!-- region ../../examples/queries/src/bulk.ts#create-and-update -->

```ts
export const createPostBatch = (
	posts: readonly { readonly slug: string; readonly title: string }[],
) =>
	Post.createMany({
		data: posts.map(({ slug, title }) => ({ slug, title })),
		select: { slug: true, title: true },
	})

export const renamePostBatch = (
	updates: readonly { readonly id: string; readonly title: string }[],
) =>
	Post.updateMany({
		data: updates.map(({ id, title }) => ({
			data: { title },
			where: { id: { eq: id } },
		})),
		select: { title: true },
	})
```

<!-- endregion -->

When the adapter reports a transient `TRANSACTION_CONFLICT` (ADR-0300), Core
replays an automatic mutation transaction — one schema mutation, collection
command, nested write graph, schema-mutation command, transactional plugin
operation or private-storage write — at most three times in total after a short
random delay. Each attempt restarts from normalization, so Access, Hooks,
`resolveInput` and nested writes run again and generated identifiers are
regenerated; post-commit effects of failed attempts are discarded. No attempt
starts after cancellation. Callbacks running inside a transaction must have no
effect outside it. An explicit `transaction()` callback is never replayed and
rejects with `TRANSACTION_CONFLICT`. Retries log at debug level and exhaustion
logs a warning, with operation, schema, attempt and code only.

Mutation results obey the row read rules of every installed policy, like
PostgreSQL's `RETURNING` under row-level security (ADR-0306). For a
non-Master caller, Core checks each resulting row before commit (after the
after hooks, before the final output restrictions) with one `exists` query by
identifier, or one grouped `count` for collection commands; a delete, and a
plugin mutation declaring `returning: 'before'`, is checked on its locked
pre-image before the write. An unreadable row with a selection beyond `id`
(no `select`, another field, or any `include`) fails with `PERMISSION_DENIED`
and rolls the transaction back. `select: { id: true }` is always allowed and
skips the check; nested children answer through the root's inclusions, which
keep their own read rules. No query runs when the read guard grants every row
without a filter.

Database plugins prepare each transaction-bound mutation through one opaque,
single-use handle. Its execution keeps the projected public result separate
from the complete logical materializations supplied to installed schema lifecycle behavior.
Every result-returning schema mutation accepts the same flat selection contract
as schema reads. `createOne()`, `createMany()`, `updateOne()`, and `updateMany()`
also accept the generated `include` contract. Each write completes first, then
Runtime projects its persisted ID inside the same transaction. Singular
commands issue one relationship read; collection commands group every persisted
ID into one read and restore declaration order independently from database
order. These internal reads do not replay root mutation policies or lifecycle
behavior, and they are omitted entirely when no relationship is requested:

<!-- region ../../examples/queries/src/writes.ts#create-post,rename-post,delete-post -->

```ts
export const createPost = (authorId: string, slug: string, title: string) =>
	Post.createOne({
		data: {
			author: { connect: authorId },
			slug,
			title,
		},
		include: { author: { select: { displayName: true } } },
		select: { published: true, slug: true, title: true },
	})

export const renamePost = (postId: string, title: string) =>
	Post.updateOne({
		where: { id: postId },
		data: { title },
		select: { title: true },
	})

export const deletePost = (postId: string) =>
	Post.deleteOne({ where: { id: postId }, select: { slug: true, title: true } })
```

<!-- endregion -->

Singular creates and updates accept schema-aware nested pointer and relation
commands inside `data` (ADR-0308): a pointer takes `connect`, `create`,
`update` (updates only) or `null` (unlinks an optional pointer); a relation
takes `connect`, `disconnect`, `create`, `update` (`{ id, data }` items), or
the exclusive `set`, where `{ set: [] }` empties it. A pointer command is
exclusive, while relation `create`, `connect`, `update`, and `disconnect`
commands may compose in that fixed order. `connect`, `disconnect` and `set`
targets are IDs or `Pointer`s of the declared target:

<!-- region ../../examples/queries/src/nested-writes.ts#create-graph -->

```ts
export const createPostGraph = (existingCommentId: string) =>
	Post.createOne({
		data: {
			author: {
				create: {
					displayName: 'Ada',
					email: 'ada@example.com',
				},
			},
			comments: {
				create: [{ body: 'First' }, { body: 'Second' }],
				connect: [existingCommentId],
			},
			slug: 'nested-post',
			title: 'Nested post',
		},
		include: {
			author: { select: { displayName: true } },
			comments: { select: { body: true } },
		},
	})
```

<!-- endregion -->

Core separates scalar candidates from relationship commands in one immutable,
application-owned graph before effects. The default ceiling is five nested
target levels and 100 statically declared operations; applications can set
`validation.nestedWrites.maxDepth` and `maxOperations`. Bulk mutations and
upserts accept pointer links (`{ connect: target }` or `null`) but no nested
`create`, `update` or relation command.

Every link checks visibility (ADR-0308): for a non-Master caller, each target
named by `connect` or `set` must be visible as a single-row read under every
installed policy, in the mutation's transaction and before the write;
`disconnect` names only visible linked targets. A missing or hidden target
fails with the same `NOT_FOUND`, whose public details name the field and target
schema, and the whole graph rolls back. Master skips visibility, never
existence.

For `createOne`, `create` and `connect` now execute recursively inside the
root's automatic transaction. Core verifies every existing target before the
first business Hook or write, creates pointer targets before their source,
creates relation targets after their source, and adds an owning edge only after
both identities have been persisted. Every object still crosses its ordinary
Runtime, Validation, Access, ACL, Hooks, constraints, persistence-rewrite, and
materialization lifecycle. Any descendant, edge, projection, cancellation, or
finalization failure rolls the complete graph back.

For `updateOne`, pointer `update` keeps the currently linked visible identity
and `null` is accepted only on optional pointers. Relation `update` is
limited to exact visible current membership, while `disconnect` and `set`
change membership without deleting target objects. Replacement changes
only the membership visible to the request, so a policy-hidden edge is never
silently removed. Owning, inverse-relation, and inverse-pointer mappings all
reuse ordinary object lifecycles and relation deltas in the same transaction.
The root result is projected with `select` and `include` only after the complete
graph has finished.

This protocol belongs to database-adapter authors rather than application code.
The root adapter starts the transaction. For update, delete, and upsert, its
transaction adapter stabilizes the visible target before schema input
resolution and installed item policy complete. Runtime then runs optional item behavior and
consumes the prepared mutation exactly once.

Policy and value-object plugins may register `preparedOperation()` when an
accepted `updateOne()` value depends on that locked target. The handler receives
the fully typed current object and may replace only values inside the existing
normalized update shape. Runtime groups this replacement with field and schema
input resolution, then performs one final structural validation followed by
optional rejection-only mutation guards and value-dependent installed field and
item policy. A guard may receive the stable prepared target so an installed
plugin can inspect projected atomic numeric values without converting them to
`set` operations. The adapter
receives the final operation for the write; protected row filters stay attached
to the prepared target.
The handler cannot change the query, target, fields, operators, schema, or
terminal kind. Public collection commands are already itemized before this
boundary, so each update entry uses the same singular lifecycle.

Results are frozen plain data, and `toJSON()` serializes them as REST does:

<!-- region ../../examples/queries/tests/writes.test.ts#round-trip -->

```ts
const created = await Post.createOne({
	data: { slug: 'preview', title: 'Preview', tags: ['draft'] },
	select: { title: true, tags: true },
})
const updated = await Post.updateOne({
	where: { id: created.id },
	data: { title: 'Published' },
	select: { title: true },
})

const json = toJSON(updated)
await Post.deleteOne({ where: { id: created.id }, select: { id: true } })
```

<!-- endregion -->

Every read and mutation returns frozen plain objects (ADR-0310): field values,
a `Pointer` for an unincluded pointer, a plain object or `null` for an included
pointer, and arrays for included relations. Results have no methods; schemas are
not constructible (`new PostSchema(data)` throws). A selected result contains
only the fields visible in it and cannot recover omitted data. Every result
exposes `id`, even when the selection did not name it.

`Model<T>`, `CreateInput<T>` and `UpdateInput<T>` name the result of `findOne`
and the write data of one schema, and `UniqueWhereInput<T>` its unique target,
where `T` is a registered schema name (`Model<'Post'>`) or a schema type
(`Model<typeof PostSchema>`).
`toJSON(value)` serializes a result, a list of results or any value inside them
exactly as REST responses do: `bigint` as a decimal string, binary as
`{ type: 'binary', encoding: 'base64', data }`, a `Pointer` as its pointer JSON,
included rows and embedded objects recursively; `JsonOf<T>` is its result type.
`JSON.stringify` on a raw result throws on `bigint`.

Schema `updateOne`, `deleteOne` and `upsertOne` take their target only through
`where` (`where: { id }`, ADR-0307). `updateOne` and `deleteOne` remain nullable
conditional mutations and skip installed item lifecycle behavior when no row
matches; use `findOneOrThrow` for a required read. Every read and write lives
on the schema; there is no mutable `save()`.

Their `where`, and the item `where` of `updateMany`, `deleteMany` and
`upsertMany`, is typed `UniqueWhereInput<T>` (ADR-0332): a union with one
member per target Runtime accepts, `{ id }`, each field declared
`indexed: 'unique'` and each unique index of `define({ indexes })` without
`where`, with all of its fields. Each value is a shorthand or `{ eq }`, never
`null`, and a member names no other unique key. A non-unique field, a partial
composite index or an extra filter fails to compile; Runtime still checks the
target, since untyped transports reach it, and accepts the same targets.
A complete unique index of `define` is a target even when it names a field a
feature adds. Partial unique indexes and unique indexes a plugin adds with
`addSchemaIndex` are storage indexes, not targets: an untyped
call that targets one fails with `… must match id, a unique field or one
non-partial unique index of define`.
`orderBy` keys are limited the same way to non-list scalar and enum fields of
Core's kinds; an untyped caller ordering by another field fails with
`query.orderBy.<field> must name a non-list scalar or enum field`. A plugin
field declared unique carries `UniqueFieldCarrier` in its type to be a target.

<!-- region ../../examples/queries/tests/upserts.test.ts#unique-target -->

```ts
const target: UniqueWhereInput<'Post'> = { slug: 'hello' }
const deleted = await Post.deleteOne({
	where: target,
	select: { slug: true },
})
```

<!-- endregion -->

## Optional Hooks and Access engines

Core exposes product-neutral Runtime behavior and protected-policy contracts.
The official authoring vocabularies live in their vertical packages and are
enabled only by configuring their plugin definitions:

```ts twoslash
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const Application = UltimaBase.use(accessPlugin(), hooksPlugin())

const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({
			required: true,
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
	}),
}).with({ access: { read: true } })

export const ultimabase = new Application({ schemas: [Post] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

Importing either package installs nothing. Without `hooksPlugin()`, the `hooks`
schema and field options are unknown. Without `accessPlugin()`, the `access`
options are unknown and direct CRUD has no Access policy stage. Core still
applies structural validation, transactions, protected constraints, anonymous
or audited-master authority, and every behavior contributed by other plugins.

JavaScript applications use the same compiled graph. This block is plain
JavaScript, which cannot declare `Register`, so the documentation tests do not
type-check it:

```js unverified
import { UltimaBase } from '@ultimabase/core'

const Note = UltimaBase.Schema.define({
	className: 'Note',
	fields: (field) => ({ body: field.string() }),
})

const ultimabase = new UltimaBase({ schemas: [Note] })
await using started = await ultimabase.start()
await Note.findMany()
```

See the [`hooks-plugin`](../hooks-plugin/README.md) and
[`access-plugin`](../access-plugin/README.md) READMEs for their declarations,
provider contracts, diagnostics, and exact Runtime semantics. Community
alternatives may define different vocabularies through Core's generic public
kernel; they do not inherit an official engine or a neutral no-op stage.

An authorized behavior provider may use `validateMutationInput` to validate
the final mutation candidate (ADR-0319). It receives the structurally
validated operation, the stable prepared targets and Core's
`structuralIssues`, and returns `{ issues, operation }`: Core merges its
issues with its own into one `VALIDATION_ERROR` (it also calls the stage with
the raw candidate when the initial structural pass rejects a mutation), and a
returned operation with other values is revalidated structurally before it is
stored. Bulk calls prefix each issue path with the failing item's index.

An authorized behavior provider may use `guardMutationInput` for a final
mutation-only rejection boundary. The handler receives the structurally
validated immutable operation plus stable prepared targets, returns no
replacement value, and runs before value-dependent enforcement reevaluation.
Providers compose in plugin graph order. Applications with no such provider
materialize no guard callback.

This absence claim is measurable rather than a promise of literal zero CPU
time: a no-product application materializes no optional behavior or enforcement
bundle and invokes no such stage per request. Canonical Runtime assembly,
validation, database execution, transactions, result materialization, and
unrelated installed capabilities still perform their normal work. The
repository protects this boundary with the deterministic
`yarn test:performance` budget.

## Policy-neutral enforcement primitives

Core exposes two policy-neutral enforcement factories without adding product
names to Runtime: `guard()` and `protectedPolicy()`. Definitions are
materialized through the exact privilege-scoped `provideRuntimeConstraint()`
capability facade:

```ts twoslash
import {
	UltimaBase,
	protectedPolicy,
	provideRuntimeConstraint,
} from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'

const PostSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
})

export const publishedOnlyPlugin = () =>
	plugin({
		id: 'example.published-only',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'published-policy',
				create: () => ({
					value: protectedPolicy({
						schema: PostSchema,
						evaluate: () => ({
							rowFilter: { field: 'published', kind: 'equal', value: true },
							selectionFields: ['id', 'title'],
						}),
					}),
				}),
			}),
		],
	})
```

`guard` only allows or throws. A protected policy's `evaluate` effects may deny
the request (`allowed: false`, with an optional server-side `reason` added to
the error message; inclusions still read the denial as absence), AND private
row filters, and return allowed
`inputFields` and `selectionFields` that compose by intersection. Restricted mutation
input is rejected, while selection restrictions project excluded fields away,
again after business result transforms. `restrictResult` may only omit values from the final result.
Runtime evaluates guards and protected policies before business effects, keeps
the accumulated state private, then reevaluates guards and reapplies input and
selection limits after operation transforms. No policy contribution means no
enforcement stage or permission placeholder.
Each definition may opt into `master: "bypass"`; omission enforces it for
master too, so trusted provider-internal queries skip only explicitly bypassable
policy work before hook-recursion checks.
The official Access policy and ACL authorization use bypass unconditionally;
their separate integrity-maintenance contributions remain enforceable for
master.

### Plugin permissions

A plugin can declare a named schema permission and ask, during a request,
whether the caller holds it (ADR-0317). Soft Delete declares `readDeleted`
this way; Core never names it:

```ts twoslash
import type { SchemaDefinition } from '@ultimabase/core'
import {
	holdsSchemaPermission,
	provideSchemaPermissions,
	type RequestContext,
} from '@ultimabase/core/plugin'

declare const isArchivable: (schema: SchemaDefinition) => boolean

export const archivePermissions = provideSchemaPermissions({
	contributionId: 'permissions',
	create: ({ schemas }) => ({
		value: schemas
			.values()
			.filter(isArchivable)
			.map((schema) => ({ permission: 'readArchived', schema })),
	}),
})

// Inside the declaring plugin's own policy or behavior:
export const seesArchived = (
	context: RequestContext,
	schema: SchemaDefinition,
) => holdsSchemaPermission(context, schema, 'readArchived')
```

Both come from `@ultimabase/core/plugin`. Master always holds every declared
permission. Otherwise Core asks every installed protected policy through its
optional `permission` handler, which answers `true`, `false` or `undefined`:
the permission is held when one policy grants it and none refuses it, so it is
refused when no policy answers (fail-closed). Asking about a permission the
schema does not declare is a programming error. Rule plugins discover the
declared names at the type level through `SchemaPermissions` and
`PluginSourceSchemaPermissions`, and through `SchemaRulesSource` for a
registered `SchemaRef` in `.with`; `definePlugin` features declare
them with `permissions: ['readArchived']`.

The official Access plugin compiles its package-owned declarations into
`protectedPolicy()` contributions supplied through this same
`provideRuntimeConstraint()` boundary. ACL uses the generic boundary directly
and does not depend on Access. Advanced framework plugins may use either the
focused factories above or `protectedPolicy()` when they own a policy-neutral
capability outside the official Access vocabulary.

## Application ownership

The sole public application owner is the configured `UltimaBase` factory from
`@ultimabase/core`. `UltimaBase.use(pluginA(), pluginB())` or
`UltimaBase.use(...plugins)` returns a new immutable factory with one flat
ordered plugin tuple. Calls can also be chained. Construction receives only instance
options. The zero-plugin root follows the same path. `compile()` validates and
snapshots deterministic schema and plugin declarations without claiming the
active-application slot. `initialize()` additionally materializes application
capabilities and runs setup, while `start()` continues through infrastructure
and transports. The application of [Declare schemas](#declare-schemas) starts
from its entry point:

<!-- region ../../examples/modeling/src/main.ts#start -->

```ts
// start() resolves to ultimabase itself; leaving this scope disposes it.
await using started = await ultimabase.start()
```

<!-- endregion -->

Every application owns its schema registry, materialized capabilities, exact
Core contribution stores, plugin exports, and lifecycle state. One private
lifecycle slot permits one initialized application per JavaScript realm;
it is not a default application, schema registry, or request context. Retain a
configured definition and call `ultimabase.plugin(database)` for the shortest
precisely typed setup-export lookup. `ultimabase.plugin('fixture.database')`
resolves by stable identity for dynamic integrations; repeated configurations use its structured
`{ pluginId, instanceId }` overload instead. A factory that names the plugin it
creates (a `PluginFactory`, with a static `pluginId`) is accepted too:
`ultimabase.plugin(validationPlugin).check(Todo, { data })`.

Plugins consume only capability requirements declared in their own manifest.
Application code reaches deliberately public application-local behavior through
typed plugin exports returned by `ultimabase.plugin(...)`; there is no
general service lookup or capability-enumeration escape hatch.

Runtime also uses `ultimabase.ownsSchema(schema)` to verify exact object
identity. A separately declared schema with the same `className` is not owned by
the application, which prevents request engines from crossing application
boundaries accidentally.

The application kernel and Runtime engine remain private Core implementation
details. A stopped application cannot be restarted; disposal permanently
releases its plugin and capability resources. Initialization claims ownership
before capability factories and setup. A second application rejects without
affecting the incumbent. Pure construction and `compile()` do not claim ownership.

`stop()` retains setup resources and the slot. `dispose()` closes new work,
waits for admitted Core execution, completes teardown, and only then permits a
new application. Invoke stop/disposal outside active request callbacks. Failed
cleanup keeps the slot blocked and repeated disposal preserves the failure;
there is no force reset. Escaped engines, grants, contexts, and handles retain
their previous owner. Static plugin mutation visibility is removed on disposal.
Independent parallel applications use separate workers, processes, or containers.
Jest/Vitest suites await `start()` in `beforeAll` and `dispose()` in `afterAll`.
Scripts declare `await using started = await ultimabase.start()`: `start()`
resolves to the application itself (concurrent calls share one promise) and the
facade implements `Symbol.asyncDispose`, so `dispose()` is awaited when the
async scope exits. Guides document only `start()`, `await using` and
`dispose()`; `compile()`, `initialize()` and `stop()` are for advanced cases.

Each program declares its application once in `Register` (ADR-0297
amendment 1), as the application of [Declare schemas](#declare-schemas) does.
Constructing an application without it is a type error whose message shows
the declaration to add.

## Application logger

`new App({ logger, logLevel })` (ADR-0313) routes every Core and plugin line.
`logger` is any object with `debug`, `info`, `warn` and `error` methods taking
`(message, details?)`, the console by default, or `false` to silence
everything; `logLevel` is `'debug'`, `'info'` (default), `'warn'` or `'error'`.
Core never reads the environment to choose them, and a failing logger never
fails what it reports on. Plugins receive the same logger, prefixed with their
package name, in their setup context, start phases and capability factories.
Lines never contain option values, secrets, credentials or row values.

After a successful `start()`, Core logs one `info` line with the schema count,
the plugin package names in graph order and the critical privileges with their
plugins, for example
`UltimaBase started: 3 schemas, 2 plugins (@acme/a, @acme/b); critical privileges: authority:elevate (@acme/b). Use logLevel 'debug' for the privilege report.`
The complete privilege report is a `debug` line; a denied privilege logs it at
`error` before failing construction. Warnings that need action stay visible at
the default level: unverified public transport protection, and the plugin
lines for transports exposing nothing or routes nothing serves.

## Framework errors

`FrameworkError` carries one stable framework code while separating trusted
diagnostics from transport-safe metadata:

<!-- region ../../examples/queries/tests/errors.test.ts#framework-error -->

```ts
const error = new FrameworkError('NOT_FOUND', 'Trusted diagnostic', {
	publicMessage: 'The requested post was not found.',
	publicDetails: { resource: 'Post' },
	internalDetails: { table: 'posts' },
})

const safePayload = error.toJSON()
```

<!-- endregion -->

The regular error message, stack, cause, and `internalDetails` remain diagnostic
state. `JSON.stringify(error)` uses the error's immutable public payload and
includes only its code, retryability, `publicMessage`, and `publicDetails`.
Transports map that payload to their protocol-specific error formats without
adding transport metadata to Core.

Asynchronous operations report every failure through the promise they return:
schema reads and commands, plugin schema mutations, `start()`, `stop()`,
`dispose()`, `transaction()` and `can()` never throw from the call itself, also
for malformed input (a `TypeError`) or a missing application
(`MISSING_EXECUTION_CONTEXT`).

Application code refuses an operation with a client-visible message by
throwing `PublicError` (ADR-0305), here from an Access rule of the queries
example:

<!-- region ../../examples/queries/src/app.ts#factory -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * Access opens every operation of a schema that declares no rule, so the blog
 * data stays public in this example; `Announcement` declares its own rules.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
	postgresPlugin(),
)
```

<!-- endregion -->

<!-- region ../../examples/queries/src/schema.ts#imports,policies,announcement -->

```ts
import {
	PublicError,
	isAuthenticated,
	type PolicyPredicate,
} from '@ultimabase/core'

import { App } from './app.ts'

/** Editors are Authors flagged `editor`; anonymous callers never are. */
export const isEditor: PolicyPredicate = async function isEditor({
	principal,
}) {
	if (principal === undefined) return false
	return Author.exists({ where: { id: principal.id, editor: true } })
}

/** Signed-in authors announce; editors change; anonymous callers only read. */
export const Announcement = App.Schema.define({
	className: 'Announcement',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({
	access: {
		read: true,
		create: {
			where: isAuthenticated,
			item: ({ item }) => {
				if (/https?:\/\//u.test(item.title)) {
					throw new PublicError('An announcement cannot contain a link.', {
						code: 'announcement.title-link',
						details: { field: 'title' },
					})
				}
				return true
			},
		},
		update: isEditor,
		delete: isEditor,
	},
})
```

<!-- endregion -->

`code` defaults to `APPLICATION_ERROR` and rejects framework codes; `cause` is
never serialized. Thrown from a hook, a policy rule or predicate, an ACL
callback, a virtual field, a custom operation or an HTTP route handler, it
aborts and rolls back the operation and is never retried; transports
serialize `{ code, message, details }` as a client error. Any other error
stays masked and logged with its stack. After commit any error, a
`PublicError` included, is only logged: a Runtime `postCommit` stage or a
post-commit effect never rejects the committed call, and the remaining effects
still run (ADR-0318 amendment).

Database adapters report three neutral storage failures (ADR-0302):
`UNIQUE_VIOLATION` with `publicDetails: { schema, fields }` (index fields,
never values), `REFERENCE_VIOLATION` naming only the schema of the deleted or
written row, and the retryable `TRANSACTION_CONFLICT`. Other rejections stay
`VALIDATION_ERROR`.

Plugin engines that observe an `AbortSignal` at a safe cooperative boundary can
use the same cancellation failure as Core Runtime:

<!-- region ../../examples/queries/tests/identity.test.ts#cancellation -->

```ts
const controller = new AbortController()
// Returns while the signal is active.
throwIfOperationCancelled(controller.signal, { phase: 'before-callback' })

controller.abort(new Error('Private reason'))
const check = () => {
	throwIfOperationCancelled(controller.signal, { phase: 'before-callback' })
}
```

<!-- endregion -->

The helper returns while the signal is active. Once aborted, it throws
`OPERATION_CANCELLED` and records only `request-aborted` or
`deadline-exceeded` as the internal reason. It never copies the arbitrary
signal reason, aborts work, detaches a running promise, or decides where a safe
checkpoint belongs.

## Author plugin packages

Core owns one package-level authoring entry point. A package factory returns one
direct `plugin()` call with stable facts and one ordered contribution list:

```ts twoslash
import { contributeApplication, plugin } from '@ultimabase/core/plugin'

export const workflowPlugin = (instanceId?: string) =>
	plugin({
		id: 'community.workflow',
		version: '1.0.0',
		core: '^0.0.0',
		...(instanceId === undefined ? {} : { instanceId }),
		contributions: [
			contributeApplication(() => ({
				exports: { ready: true as const },
			})),
		],
	})

export type WorkflowPlugin = ReturnType<typeof workflowPlugin>
```

Capability providers and requirements, operations, static declarations, and
the optional application resource all enter `contributions`. Core compiles that
list once into its native immutable plugin plan; there is no second setup/hooks
authoring model behind `plugin()`. It derives every required privilege from the
contribution types and reports each one with a description generated from the
contribution that needs it. `permissions` optionally replaces that description
with an author reason; it is required only for the critical `authority:elevate`
and `storage:private` privileges, and a reason for a privilege the plugin does
not derive fails construction. A callback that needs an additional privileged
facade uses `withPluginPrivileges()` around that exact contribution, keeping
the power next to the code that consumes it.

An application resource that only owns lifecycle work may omit `exports`:

<!-- region ../../examples/plugin-authoring/src/client-plugin.ts#lifecycle -->

```ts
// A lifecycle-only resource: no exports; Core calls each phase in order.
contributeApplication(() => ({
	connect: () => {
		client.connect()
	},
	dispose: () => {
		client.disconnect()
	},
})),
```

<!-- endregion -->

Core exposes `undefined` for that plugin and keeps the same resource for every
lifecycle callback. If the plugin exposes an application-local API, add
`exports` and its exact type remains available through plugin lookup.

Plugin packages import every authoring contract from the plugin-author
subpath `@ultimabase/core/plugin` (ADR-0311, ADR-0316): `plugin()`, the
contribution factories, capabilities, schema declaration registrars and patch
operations, option definitions, operations, schema mutations, projection
slots, plugin identities and the plugin graph. The main
entry keeps what applications use, and still exports the lower-level Runtime
and transport contracts that some plugins consume: the Runtime providers
(`provideRuntimeBehavior()`, `provideRuntimeConstraint()`,
`provideRuntimeInterceptor()`, `protectedPolicy()`, `guard()`), private
storage (`definePrivateCollection()`, `privateStore()`), plugin field codecs
(`definePluginField()`), the request execution and subject capabilities, and
the transport helpers such as `transformQueryFilterInput()`.

`plugin()` infers the plugin's static source from its contributions; a facade
that knows it better passes it as the last type argument instead of re-typing
the result. `readSchemaRules(schema, owner)` returns the values a compiled
schema gave to the options one plugin declared, `.with` rules and feature
options alike, and nothing of other plugins:

```ts twoslash
import {
	Schema,
	getOperationSchema,
	provideRuntimeBehavior,
} from '@ultimabase/core'
import { readSchemaRules } from '@ultimabase/core/plugin'

export const auditBehavior = provideRuntimeBehavior({
	contributionId: 'audit',
	create: ({ owner }) => ({
		value: {
			postCommit: ({ operation }) => {
				const schema = getOperationSchema(operation)
				if (
					Schema.is(schema) &&
					readSchemaRules(schema, owner).audit === true
				) {
					console.info(schema.className)
				}
			},
		},
	}),
})
```

`runAfterCommit(work)` queues work on the current transaction: once it
commits, the queued works run in order outside the transaction and the
request, without delaying the response; a rollback or a replayed attempt
discards them, and a failure is logged (ADR-0318). The application tracks the
pending work: `stop()` and `dispose()` wait for it, and so does
`waitForAfterCommitWork()`, which tests use through `t.afterCommit()` of
`testApplication` (`@ultimabase/testing`) or `waitForAfterCommit()` from
`@ultimabase/testing/plugins`.

A schema mutation declared with `target: 'many'` takes `{ where }` instead of
`{ id }`: inside one transaction, Core enforces the command once to find the
rows it may target (protected policies and rule filters included), then runs
the one-row pipeline for each of them, in identifier order, so Access, Hooks
and readable-result checks apply per row and one refusal rolls everything back.
Many-row mutations have no transport binding yet. When a command's write hits
a unique index, Core reports `UNIQUE_VIOLATION` with `Cannot run <command> on
<Schema> <id>: <fields> is now used by another row.`, keeping the values in the
internal details. A command effect may write `null` to clear an optional field
it owns.

The same entry exports the request-context machinery that applications never
need: `RequestContext`
(with `RequestContext.anonymous`), `RequestContextValue`,
`RequestCapability`, `requestSources`, `RequestEngine`,
`anonymous(app, options)`, `withContext(app, context)` and
`authorizeMasterKey(app, rawKey)` for transports, and the `WhereBuilder` and
`QueryBuilder` classes; the main entry exports both builders as types only,
since applications receive builders where Core passes them. It also exports
the shared cursor encoder of ADR-0309: `encodeQueryCursor(schema,
orderBy, row)` turns the position of a received row into an opaque base64url
string of at most 4096 characters (version, schema name, ordering completed by
`id`, ordered values), and `decodeQueryCursor(schema, orderBy, cursor)` returns
the `after` position for a read with the same schema and ordering. A malformed
or mismatched cursor fails with the same `after` `VALIDATION_ERROR`. Cursors are
unsigned: a position grants nothing, so it stays valid across restarts and
instances.

`openApplicationHarness(ultimabase)` is the test harness `testApplication`
of `@ultimabase/testing` uses (ADR-0327). It opens only on an application
that has not started, once, and returns the only object holding two powers:
`master(options)` creates a request engine with Master authority without a
configured key, each elevation logged at `debug` ("Harness elevated to
Master"), and `resetDatabase()` empties the application's data through the
database plugin's `databaseResetCapability`, then reruns the plugins' `ready`
seeding. An application started with `ultimabase.start()` can never be
harnessed afterwards; no option, environment variable or transport input
opens one.

## Cross-plugin integration

Versioned capabilities are the only public cross-plugin integration host.
Declaration capabilities expose immutable facts before compilation; application
capabilities materialize one application-local `{ value, dispose? }` resource
before setup. Consumers can read only the exact required or optional capability
objects listed in their manifest. Exact identity and cardinality reject
ambiguous providers before materialization.

An exclusive service is a `single` application capability, while behavior
intended for application developers is exposed through the owning plugin's
typed setup export.

### Database adapter contract

Core owns the storage contract; each adapter enforces it with what its database
offers and Core does not emulate it.

- **Referential integrity (ADR-0299).** After every commit, each non-null
  pointer and private-storage reference designates an existing row. `restrict`
  (default) and private `fail` reject deleting a referenced row with
  `REFERENCE_VIOLATION`; `cascade` deletes referencing rows transitively in the
  same transaction (a `restrict` in the chain fails everything); `setNull`
  clears optional pointers. Cascades are physical: no Hooks, Access, ACL, Soft
  Delete rewrite or event on referencing rows. A write referencing a row and a
  concurrent deletion of that row never both commit with a dangling reference.
  Soft deletion triggers no referential action.
- **Conflicts (ADR-0300).** A failure is transient only when the adapter
  guarantees a complete rollback; it reports `TRANSACTION_CONFLICT` with
  `retryable: true`. An unknown commit outcome is never transient.
- **Semantics (ADR-0302).** Several `null`s never conflict in a unique index;
  a partial unique index applies only to matching rows; `null` sorts last in
  both directions; equality on a list or JSON array compares the whole value;
  each statement sees committed data and its own writes, mutation targets stay
  stable from loading to commit and atomic updates never lose a concurrent
  update (serializability is not promised); decimals are stored and returned
  exactly, and an adapter that cannot hold a declared precision refuses to
  start.
- **Capabilities (ADR-0301, ADR-0303).** `filterOperators` lists the built-in
  filter discriminants executed per field family (a missing entry means
  unsupported); the database plugin also provides the same declaration through
  the declaration-lifetime `databaseFilterOperatorsCapability`, so a transport
  compiling its schema before any connection, such as GraphQL, lists only
  these operators (ADR-0325). `partialIndexes` allows indexes with `where`. Application start
  fails with `PLUGIN_ADAPTER_CAPABILITY_MISSING` when a partial index, its
  operators, a plugin containment field or a relation field needs a capability
  the adapter lacks.
- **Reset (ADR-0327).** A database plugin may provide the application-lifetime
  `databaseResetCapability` (`{ kind: 'reset', version: 1, reset() }`): it
  empties every table it manages for the application (schemas, relation links,
  private storage), keeping the tables and restarting identities. Only an
  application harness invokes it; no request path does.
- **Health (ADR-0303).** `checkHealth(signal)` is required; it backs
  `ultimabase.health()`, which resolves to `'OK'` when the application is
  started and the database answers within two seconds and to `'DEGRADED'`
  otherwise, never throwing and logging the cause only on the server.

### Adapter boundaries

Portable plugins reach the database only through Core's neutral adapter
contracts (`databaseAdapterCapability`, `databasePersistencePlanCapability`
and the private-storage protocol). There are no raw adapter leases, adapter
support tokens, physical-schema contributions or database constraint
compilers.

Core does not plan migrations or classify contribution upgrades or orphans,
and PostgreSQL synchronization preserves unmatched storage.

### Owner-private plugin storage

Plugins that persist verifier-like records without creating application models
request the critical `storage:private` privilege and declare nominal,
callback-free collections during static compilation:

<!-- region ../../examples/plugin-authoring/src/sessions-plugin.ts#private-sessions -->

```ts
import {
	definePrivateCollection,
	privateStore,
	stringField,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
} from '@ultimabase/core/plugin'

const sessions = definePrivateCollection({
	contributionId: 'sessions',
	fields: {
		secret: stringField({ immutable: true, required: true }),
		version: stringField({ required: true }),
	},
	indexes: [{ fields: ['secret'] }] as const,
})

const text = defineOperationValue((value, path): string => {
	if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
	return value
})

/** Reports the stored verifier's version, or `none`. */
export const sessionVersion = defineOperation({
	input: text,
	name: 'community.sessions.version',
	result: text,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

export const sessionPlugin = plugin({
	contributions: [
		contributeDeclarations({
			privateStorage: ({ privateStorage }) => {
				privateStorage.register(sessions)
			},
		}),
		contributeOperation({
			operation: sessionVersion,
			// Only this plugin's own callbacks may open its private store.
			execute: async ({ input }) => {
				const store = privateStore(sessions)
				const found = await store.findUnique({ where: { secret: input } })
				if (found !== null) return found.version
				await store.insert({ data: { secret: input, version: '1' } })
				return 'none'
			},
		}),
	],
	core: '^0.0.0',
	id: 'community.sessions',
	// Critical privileges are the only ones that need an explicit reason.
	permissions: { 'storage:private': 'Stores revocable session verifiers.' },
	version: '1.0.0',
})
```

<!-- endregion -->

Inside an attributed callback owned by that exact plugin instance,
`privateStore(sessions)` exposes only `findUnique`, `insert`, `update`, `delete`,
and `compareAndSwap`. Reads reuse the current request; writes reuse its active
transaction or open one automatic transaction. A retained handle is bound to
the application and owner that created it and is rechecked on every operation.

This is an addressable-record boundary, not a private ORM. Every read and
mutation targets one declared exact unique index. Data that needs scans,
filters, ordering, pagination, bulk mutations, relations, Hooks, Access,
transports, or developer queries belongs in an application schema or a focused
domain capability instead. Adapter requests form an exact discriminated union,
so an implementation never has to infer which fields are present for an
operation. Migration and cleanup protocols remain separate architectural work.

Private collections compile through the selected database adapter but never
enter the application schema registry, Query/model handles, transports, Hooks, Access, validators, policies, observers, or
events. References may target an exact public schema with `fail` or `cascade`
deletion behavior without making the private row traversable. Applications with
no declaration perform no private adapter configuration.

## Plugin definitions

`plugin(options)` creates immutable metadata from one ordered contribution list
without executing application resources:

```ts twoslash
import {
	contributeApplication,
	defineCapability,
	plugin,
	provideCapability,
} from '@ultimabase/core/plugin'

const dialectCapability = defineCapability<{
	readonly dialect: 'postgres'
}>()({
	capabilityId: 'fixture.database-dialect',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})

export const databasePlugin = () =>
	plugin({
		id: 'fixture.database',
		version: '1.0.0',
		core: '^0.0.0',
		environment: ['environment:network'],
		dependencies: [{ pluginId: 'fixture.config', version: '^1.0.0' }],
		contributions: [
			provideCapability(dialectCapability, {
				contributionId: 'postgres',
				value: { dialect: 'postgres' },
			}),
			contributeApplication(() => ({
				exports: { dialect: 'postgres' as const },
			})),
		],
	})
```

The manifest snapshots a namespaced stable `pluginId`, an optional explicit
`instanceId`, the plugin's canonical semantic version, its supported Core
range, exact derived privileges with reasons, and direct Node.js environment
claims. Enforceable privileges and informational environment claims are
separate contracts. The closed privilege vocabulary has documented Core facade
ownership and severity; wildcard requests are invalid. Direct filesystem and
network behavior is reported only through `environment:filesystem` and
`environment:network`: Core has no enforceable host-I/O facade or corresponding
privilege. The `typegen:reference` privilege left with Typegen (ADR-0297).

The Core range is checked like a peer range (ADR-0338): when an application is
constructed, a plugin whose `core` range the installed Core version does not
satisfy fails with `PLUGIN_PROTOCOL_INCOMPATIBLE`, for example
`Plugin "community.workflow" requires @ultimabase/core version "^1.0.0", but version "0.0.0" is installed.`
Prerelease versions follow the same SemVer `satisfies` rule as peers. Official
plugins declare the range their package publishes for `@ultimabase/core`, so
each Core release moves them together.

Manifest literals and application exports retain their exact types for plugin lookup.
Application resources and declaration callbacks do not run during manifest
inspection. Required dependencies, optional dependencies, conflicts, and
contributions are copied and frozen. Every installed definition appears
once in the application's flat `.use()` chain; plugin relationships are
declared explicitly.

`defineCapability` accepts an optional `hint` (ADR-0313): one line of plain
text, at most 200 characters, written by the capability's owner, for example
`Install @acme/audit-plugin and add auditPlugin() to UltimaBase.use(...)`.
When a required capability has no provider, `PLUGIN_CAPABILITY_MISSING`
appends the hint to its message and to `internalDetails.hint`. Core's own
tokens (database adapter, principal resolver) carry neutral hints
that name no plugin.

Named dependencies use `{ pluginId, version, instanceId? }`. Their SemVer range
is checked against the installed plugin version, and `instanceId` targets one
exact configuration when the same plugin is installed more than once. Prefer a
capability requirement when several packages can provide the same behavior:

```ts twoslash
import {
	defineCapability,
	optionalCapability,
	plugin,
} from '@ultimabase/core/plugin'

const auditSinkCapability = defineCapability<{
	readonly write: (line: string) => void
}>()({
	capabilityId: 'fixture.audit-sink',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

const auditRequirement = optionalCapability(auditSinkCapability, '^1.0.0')

export const consumer = plugin({
	id: 'fixture.audit-consumer',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [auditRequirement],
})
```

`defineCapability<Provider, Consumer>()` creates a nominal token with its own
protocol version, `single`, `multiple`, or `pipeline` cardinality, and
`declaration` or `application` lifetime. Its required `compose` function turns
the final ordered provider tuple or list into the exact consumer view while
remaining outside serializable inspection metadata. Declaration providers copy
and deeply freeze a portable JSON `value`. Application providers instead expose
an inert `create` factory that runs once per application before plugin setup and
returns `{ value, dispose? }`.

Every provider has one stable owner-local `contributionId`, recorded together
with its exact plugin and instance in `PluginGraph.capabilities`. Core derives
it from the nominal capability ID by default. Authors set it only to distinguish
repeated providers of the same `multiple` or `pipeline` token from one owner.
The graph owns this inspection inventory; Core does not expose a parallel
inventory constructor.
Dependency order and configuration position determine provider order. A
`single` token rejects competing providers; `multiple` and `pipeline` tokens
retain their ordered providers. Authors put providers and requirements in one
`contributions` list; each nominal declaration already records whether it
provides, requires, or optionally consumes a capability. The inspected
manifest retains the normalized `provides`, `requires`, and `optional` groups.

Plugins read only the exact `requireCapability(...)` or
`optionalCapability(...)` objects listed in their manifest:

<!-- region ../../examples/plugin-authoring/src/format-capability.ts#format-capability -->

```ts
import {
	contributeApplication,
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core/plugin'

/** The token both plugins agree on, instead of a service looked up by name. */
export const formatCapability = defineCapability<{
	readonly format: 'compact'
}>()({
	capabilityId: 'community.workflow-format',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'declaration',
	version: '1.0.0',
})

const format = requireCapability(formatCapability, '^1.0.0')

export const formatProvider = plugin({
	contributions: [
		provideCapability(formatCapability, {
			value: { format: 'compact' },
		}),
	],
	core: '^0.0.0',
	id: 'community.workflow-format',
	version: '1.0.0',
})

export const formatConsumer = plugin({
	contributions: [
		format,
		contributeApplication(({ capabilities }) => ({
			exports: { format: capabilities.get(format).format },
		})),
	],
	core: '^0.0.0',
	id: 'community.workflow-consumer',
	version: '1.0.0',
})
```

<!-- endregion -->

Structurally recreated or undeclared requirements fail without probing the
installed graph. The default `materialization` phase establishes provider-first
factory and lifecycle order. Peer plugins that only need each other's values in
`setup` may opt out of that graph edge explicitly:

```ts twoslash
import { defineCapability, optionalCapability } from '@ultimabase/core/plugin'

const peerCapability = defineCapability<{ readonly ready: boolean }>()({
	capabilityId: 'fixture.peer',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

export const peerRequirement = optionalCapability(peerCapability, '^1.0.0', {
	phase: 'setup',
})
```

Core still validates the provider and version before materializing all
application capabilities, but setup-phase requirements cannot be read by an
application capability factory and do not establish `connect`, `stop`, or
`dispose` order. Application resources are isolated per application and
disposed after their owner's plugin `dispose` hook. Every application
capability factory also receives its Core-bound `owner` and an
`assertPrivilege(...)` function for exact effect-time checks; neither value can
grant a privilege missing from the plugin's manifest.

Factories also receive `callbacks`, an application-bound execution-attribution
helper for vertical engines that host callbacks from several owners. Use
`callbacks.runApplication(callback)` for an inline application declaration and
`callbacks.runPlugin(owner, callback)` for a capability contribution retaining
its exact plugin and optional instance identity. The helper preserves exact
sync or async result types, validates plugin ownership against the application,
and exposes no application, authority, credential, or Runtime service. Nested
attribution replaces the outer engine owner; it never lends the host plugin's
privileges to a contributor.

When a plugin only requires another plugin's compatible public protocol, use a
non-ordering peer instead of a dependency:

<!-- region ../../examples/plugin-authoring/src/graphql-addon.ts#graphql-addon -->

```ts
import { plugin } from '@ultimabase/core/plugin'
import { provideGraphqlSchemas } from '@ultimabase/graphql-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'

const health = new GraphQLSchema({
	query: new GraphQLObjectType({
		fields: {
			workflowHealth: {
				resolve: () => 'ok',
				type: GraphQLString,
			},
		},
		name: 'Query',
	}),
})

export const workflowGraphqlAddon = () =>
	plugin({
		contributions: [
			provideGraphqlSchemas({
				contributionId: 'workflow-health',
				create: () => health,
			}),
		],
		core: '^0.0.0',
		// Checked against the installed GraphQL plugin, without ordering.
		peers: [{ pluginId: '@ultimabase/graphql-plugin', version: '^0.0.0' }],
		id: 'community.workflow-graphql',
		version: '1.0.0',
	})
```

<!-- endregion -->

Peers are required, versioned, and instance-aware, but add no graph or
lifecycle edge. They do not grant setup exports or capability reads. Use
`dependencies` or `optionalDependencies` whenever provider-first order is part
of the contract. A required dependency also requires compatible identity; an
optional dependency adds provider-first order only when present. Use a
versioned capability instead when the contract is behavior that several
different plugins may provide.

`pluginPrivileges` evaluates cumulative denials before field declarations,
schema compilation, setup, or infrastructure work. Core-controlled
privileges and informational environment claims stay visibly separate:

```ts twoslash
import { UltimaBase } from '@ultimabase/core'
import { contributeApplication, plugin } from '@ultimabase/core/plugin'

const workflowPlugin = (instanceId?: string) =>
	plugin({
		id: 'community.workflow',
		version: '1.0.0',
		core: '^0.0.0',
		...(instanceId === undefined ? {} : { instanceId }),
		contributions: [
			contributeApplication(() => ({ exports: { ready: true } })),
		],
	})

const WorkflowApplication = UltimaBase.use(workflowPlugin('editorial'))

const PostSchema = WorkflowApplication.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

export const ultimabase = new WorkflowApplication({
	schemas: [PostSchema],
	pluginPrivileges: {
		deny: ['authority:elevate'],
		denyClaims: ['environment:native-code'],
		plugins: {
			'community.workflow': {
				deny: ['authority:elevate'],
				instances: {
					editorial: {
						deny: ['transport:expose'],
					},
				},
			},
		},
	},
})

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

`deny` prevents a derived request for an enforceable Core facade.
`denyClaims` rejects a plugin that announces direct filesystem, network,
process, or native-code behavior; it never claims to sandbox trusted in-process
JavaScript. Unknown privileges, claims, plugin IDs, and instance IDs are
configuration errors. Denied requests and claims produce one aggregate
`PLUGIN_PRIVILEGE_DENIED` error before any plugin callback runs. Every denial
identifies the exact plugin and optional instance, reason, review severity, and
whether policy blocked execution before static declaration or a later Core
facade rejected the effect.

The application logger (ADR-0313) writes the complete report at `debug`
(`logLevel: 'debug'`), or at `error` when requests are denied; the startup
summary line names only critical privileges. `logger: false` silences it.
Logger failures are isolated from policy results. `application.pluginPrivilegeReport` exposes the detached report
without plugin options, credentials, capability values, or stack traces.

`normalizePlugins(definitions)` resolves the configured application's flat
plugin tuple into immutable metadata without running plugin code. The `.use()`
chain retains source order, and the exact same definition can be reused safely.
Repeated configurations of one stable ID require distinct, explicit instance
IDs. A duplicate structured identity fails with
`PLUGIN_CONFLICT`; exclusive provider selection belongs to `single`
capabilities.

`new PluginGraph(normalizedPlugins)` validates required and optional
dependencies, capability availability and nominal identity, semantic versions,
explicit conflicts, duplicate entries, and cycles. It exposes
the deterministic dependency-first order through `graph.plugins` and iteration:

```ts twoslash
import {
	PluginGraph,
	contributeApplication,
	normalizePlugins,
	plugin,
} from '@ultimabase/core/plugin'

const configuredPlugins = [
	plugin({
		id: 'fixture.config',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [contributeApplication(() => ({ exports: {} }))],
	}),
] as const

const graph = new PluginGraph(normalizePlugins(configuredPlugins))

for (const plugin of graph) {
	console.log(plugin.definition.manifest.identity)
}

for (const capability of graph.capabilities) {
	console.log(capability.token.capabilityId, capability.providers.length)
}
```

Configuration position breaks ties between plugins that are ready together.
Missing optional dependencies and capabilities remain inspectably inactive.
Graph construction remains static, exposes no declaration capability values,
and never executes setup or lifecycle hooks.

## Setup facades

Plugin setup keeps only infrastructure-specific facades owned by Core. Each accepts only its nominal definition or
requirement type, records the exact plugin and instance owner, checks its
dedicated privilege, and closes when setup finishes. Their backing stores are
private to Core; applications cannot enumerate or mutate them.

Each extension need has one supported path:

- an exclusive value is a canonical `single` capability;
- a public service is an application capability;
- optional Hooks and Access use application capabilities owned by their packages;
- low-level behavior, policy enforcement, and logical operation interceptors use
  `provideRuntimeBehavior()`, `provideRuntimeConstraint()`, and
  `provideRuntimeInterceptor()`;
- product event and diagnostic capabilities retain their own `runtime:observe`
  checks; Core has no generic observer registration API;
- Core constructs its canonical Runtime directly and retains application,
  authority, cancellation, and transaction boundaries;
- physical persistence rewrites use the ordered
  `persistencePlanRewriterCapability` and exact
  `providePersistencePlanRewriter()` facade under `persistence:rewrite`;
- cross-plugin commands are domain capabilities, such as
  `requestSubjectReferenceCleanupCapability`;
- ownership comes from the owner provenance compiled schemas retain; and
- Core has no operator, generator, or transport registry.

Core owns normalization and transaction commit. Plugins use Runtime behavior
stages with `provideRuntimeBehavior()` or `preparedOperation` with
`provideRuntimeInterceptor()` under `runtime:intercept`; they cannot contribute
normalization/commit stages.

Persistence plan protocol version 2 keeps logical operations immutable while
separating plugin-owned schema-mutation identity from its Core-compiled
`update-one` or `delete-one` statement. Native rewrites still allow only
`delete-one` to `update-one` and `delete-many` to `update-many`. A rewriter
receives the logical operation and an immutable
target, data, returning, and provenance plan, but never receives protected row
filters. Core keeps those restrictions in the adapter request envelope and
applies them to the final physical statement. Adapters
must advertise `databasePersistencePlanCapability`; missing versions or plan
kinds fail before an adapter effect. Rewrites use neither nested Runtime
operations nor master authority.

A rewriter may target one `schema`, an immutable `schemas` collection compiled
for the current application, or omit both to target every matching logical
operation. An empty `schemas` collection is an inert application-local plan:
the callback is not invoked and no rewrite provenance is appended.

Independent subject consumers provide deletion participation without importing
the provider that resolves that subject:

```ts twoslash
import {
	defineRequestSubjectReferenceCleanup,
	requestSubjectReferenceCleanupCapability,
} from '@ultimabase/core'
import { provideCapability } from '@ultimabase/core/plugin'

declare const referenceStore: {
	has(reference: string | number): Promise<boolean>
	remove(reference: string | number): Promise<void>
}

export const documentsCleanup = provideCapability(
	requestSubjectReferenceCleanupCapability,
	{
		contributionId: 'documents.subject-references',
		create: () => ({
			value: {
				name: 'documents.subject-references',
				cleanup: defineRequestSubjectReferenceCleanup({
					kind: 'group',
					hasReferences: ({ reference }) => referenceStore.has(reference.value),
					cleanup: ({ reference }) => referenceStore.remove(reference.value),
				}),
			},
		}),
	},
)
```

Both callbacks execute only when the subject provider explicitly discovers the
contribution. Their database work inherits the active request transaction;
Core does not name a concrete reference store or policy product.

Principal owners can encode an exact Pointer without sharing their schema with
the cleanup provider:

```ts twoslash
import {
	UltimaBase,
	createRequestPrincipalReference,
	parseRequestPrincipalReference,
} from '@ultimabase/core'

const User = UltimaBase.Schema.define({
	className: 'User',
	fields: (field) => ({ name: field.string() }),
})
declare const userId: string

const reference = createRequestPrincipalReference(User.pointer(userId))
const identity = parseRequestPrincipalReference(reference)
export { identity }
```

The versioned neutral value preserves only `className` and `id`. Parsing
validates that boundary without resolving a User schema or importing an
authentication package.

Plugin schema patches may contribute fields without teaching Core about the
plugin domain. Contributed fields join ordinary validation, inference,
installed behavior, policies, and adapter metadata. Core rejects collisions
with developer, system, model, or other contributed fields. A plugin field may
explicitly defer its required create value until `resolveInput`; the normal
revalidation boundary still requires that value before installed policies and
persistence.

An additive patch may set `mutationInput: 'forbidden'` when the contributing
plugin alone owns every write to a stored field. The field remains selectable
and participates in persistence, filtering, schema preparation, and output
validation, while Core omits it from create, update, bulk, upsert, nested,
and transport mutation inputs. Defaults still materialize on create,
and plugin-owned schema-mutation effects may write the field through their
separate provenance-checked effect boundary.

Portable plugin scalars may additionally declare a private, versioned JSON
storage codec through `definePluginField()`. Core validates and snapshots both
codec directions without placing executable functions in field metadata.
Database adapters may consume `getPluginFieldStorageCodec()` generically, while
plugin kinds without a portable codec still require a specialized adapter
integration. A non-list field with that codec also receives complete-value
`eq`, `ne`, `in`, and `notIn` filters. Operands pass through the same logical
snapshot guard; the codec does not imply ordering, string, structural, or
custom domain operators.

Plugin fields may independently attach private JSON wire codecs to exact
nominal protocol objects. `definePluginFieldWireProtocol({ name, version })`
returns the process-canonical identity for one namespaced protocol and exact
semantic version, allowing a field owner and transport to agree without
importing each other. `getPluginFieldWireCodec(field, protocol)` resolves only
that identity-matching codec. Core reapplies the logical scalar snapshot in
both directions and validates encoded JSON without placing callbacks in field
metadata. Storage and wire codecs are never interchangeable by default.

A scalar plugin field may separately opt into `structuralContains` when it has
that JSON codec. Its pure `snapshotOperand` validates the plugin-owned partial
input; Core then independently validates, detaches, and freezes the returned
JSON fragment. Query and protected `rowFilter` authoring reuse the ordinary
`contains` leaf; inert schema artifacts retain no callback. Adapters must announce
the exact `databasePluginFieldStructuralContainsCapability` marker before Core
sends such a leaf. Lists remain unsupported, and the opt-in does not grant
any other operator. See the
[`community field example`](examples/schema/plugin-field-containment.md).

A plugin field may also declare, without placing callbacks in metadata:
`snapshotUpdateInput`, an extra value its update data accepts (typed with
`FieldUpdateInputCarrier`, such as ACL's `{ grant }`), which the owning plugin
turns into a field value in a singular prepared update; `existingRows(schema)`,
the value existing rows receive when storage adds the field to a table with
rows, or why there is none; and `storageDefault`, the default storage keeps
for rows written without the field. Adapters read them with
`readPluginFieldExistingRows` and `readPluginFieldStorageDefault` (ADR-0321).

## Plugin-owned declaration targets

Core provides provenance-checked generic schema, nested-field, and
field-kind target resolution. Concrete products own the factories and
declarations they place on those targets. The official Hooks and Access
packages therefore expose their own typed target helpers without a Core setup
registry, hidden dispatcher, or private bridge.

Application compilation expands owner-scoped selectors deterministically and
rejects foreign schemas, invalid paths, forged field-kind
targets, duplicate contribution identities, and orphaned owners before
infrastructure starts. Removing a concrete plugin removes both its option
namespace and its target vocabulary from the compiled application graph.

## Plugin lifecycle

Each application executes its resolved plugin graph through an internal
lifecycle manager, which Core does not export, without merging declaration and
infrastructure work: `ultimabase.start()` runs every plugin setup, validates
the application before any connection is opened, then runs the forward
phases; `stop()` and `dispose()` on the started application run the reverse
ones. A plugin takes part through the phase callbacks of its application
resource (see `contributeApplication()` above).

Setup and forward phases use dependency order. The forward sequence is
`connect`, `prepareSchema`, `startRuntime`, then `startTransports`; `ready`
then runs once the application is started and accepts queries, before
`start()` resolves, for seeding work such as Roles `ensure` (ADR-0322). A
failing `ready` fails `start()`. Stop and
dispose use reverse dependency order. Setup, start, stop, and dispose retain one
promise while active and do not repeat completed work. A lifecycle cannot start
again after stop or disposal; calling stop before start is a no-op.

When setup or startup fails, completed plugins are stopped when active, disposed
in reverse order, and application services are released. Cleanup continues after
individual teardown failures. An `AggregateError` preserves the original failure
alongside any additional cleanup errors.
