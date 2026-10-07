# ADR-0213: Direct plugin options replace schema and field extensions

- Status: accepted
- Date: 2026-08-21
- Supersedes: ADR-0002, ADR-0051, ADR-0130
- Refines: ADR-0029, ADR-0078, ADR-0082, ADR-0097, ADR-0119, ADR-0122, ADR-0138, ADR-0187, ADR-0192, ADR-0196, ADR-0198, ADR-0202, ADR-0204
- Depends on: ADR-0187, ADR-0192, ADR-0196, ADR-0198

## Context

UltimaBase introduced `SchemaExtension` and `FieldExtension` before its open
plugin kernel could declare direct schema and field options, plugin fields,
owner-attributed patches, application capabilities, and structured Typegen
contracts. Extensions gave Schema one neutral container for opaque plugin
configuration, required an expected plugin name, and let a schema extension
contribute reserved fields.

That container is no longer the smallest mechanism for any configuration use.
Direct plugin options already provide strict normalization, exact installed
owner resolution, provenance, Typegen descriptors, optional Runtime compilers,
opaque callback handling, application isolation, and unknown-option failure
when their plugin is absent. Plugin-defined fields own distinct logical values.
Ordinary schema patches already add fields and indexes with owner attribution.
Capabilities remain the only cross-plugin integration host.

Keeping extensions beside those contracts creates two names for plugin
configuration, two transformation vocabularies, and a large second path through
Schema, the complete compiler IR, provenance, official plugin authoring, tests,
and documentation. The word also conflicts with query surface extensions,
which are callable application-handle methods rather than schema metadata.

UltimaBase is still in pre-release development. The replacement does not need
a deprecation or compatibility period.

## Current production inventory

The removal audit is defined by symbols and responsibilities rather than only
by current filenames, so moving code cannot preserve the old contract under a
different module.

### Schema and field declarations

- `schema/extensions/definition.ts` defines `ExtensionDefinition`,
  `ExtensionScope`, `SchemaExtension`, `FieldExtension`, extension field
  contributions, contextual binding, the two factories, and list
  normalization.
- `schema/schema/definition.ts` carries the schema `extensions` declaration,
  contextual callback, normalized tuple, generic inference, contributed-field
  merge, duplicate checks, and public metadata property.
- `schema/schema/model-class.ts` exposes the static `extensions` getter;
  `model-contracts.ts` propagates the extension generic through schema model
  types.
- common field options and relation options accept field extensions, while
  `fields/base/options.ts` and `fields/builtins/relation.ts` normalize them.
- `schema-option-resolution.ts` reserves the schema `extensions` key and copies
  the tuple around direct option normalization.
- `extension-handlers.ts` recursively checks that each extension's declared
  plugin ID is installed. It no longer registers a behavior handler; concrete
  readers interpret the metadata themselves.

### Transformations, targeting, and provenance

- `schema-patch-contracts.ts`, `schema-artifact-patch-operations.ts`, and the
  public declaration barrels expose add, replace, and remove operations for
  schema extensions.
- `schema-extension-transformations.ts` adds or removes extension-owned fields
  and synchronizes their provenance; `schema-transformations.ts` carries that
  state through final compilation.
- `declaration-targets.ts` validates extension ownership, compares extension
  identities, and reads field-extension occurrences for concrete plugin
  target expansion.
- `schema/schema/provenance.ts` and
  `schema-declaration-provenance.ts` retain a parallel
  `SchemaExtensionProvenance` list.
- Plugin Kit's `SchemaPatchBuilder.addExtension()` wraps the Core patch
  operation.

### Complete compiler IR

- protocol 2.0.0 includes the `'extension'` artifact kind,
  `SchemaCompilerExtensionNode`, schema `extensions`, and add, replace, and
  remove extension operations.
- the input encoder, patch encoder, decoder, canonical state, canonical
  artifact operations, operation context, node validation, provenance
  validation, and public IR barrels all preserve and validate those nodes.
- extension nodes carry their contributed logical field nodes in addition to
  the nominal extension artifact. This duplicates the ordinary field patch
  representation for the final graph.

### Official and community-facing consumers

- ACL creates `acl()` as a contextual schema extension, contributes its
  reserved persisted field, and repeatedly reads its config from
  `schema.extensions` for policy, input, cleanup, and event behavior.
- PostgreSQL exports `postgresTable()` as a schema extension and
  `postgresColumn()` as a field extension, then reads them for physical table
  naming and explicit column-rename intent.
- `RoleSchema.define()` appends a private role schema extension. The Roles
  Runtime already uses a package-private `WeakMap` keyed by the exact schema
  class for behavior; the extension additionally forces plugin presence and
  carries transport metadata that has no production consumer.
- Access publicly exports `schemaExtensionAccess()` and
  `fieldExtensionAccess()` plus their target types. Hooks publicly exports
  `schemaExtensionHooks()`. Repository production code has no consumer of
  those three helpers; only focused tests exercise them.
- `@ultimabase/testing` records extension names and extension provenance in
  its static plugin snapshot.

### Public and Typegen surfaces

- Core's schema and foundation barrels export every extension definition,
  contextual binding type, factory, patch operation, provenance record, and
  compiler-IR extension node.
- ACL exports `acl`, `aclSchemaExtensionName`, and its schema-extension types.
  PostgreSQL exports both extension factories and their option and extension
  types. Roles exports `roleSchemaExtensionName`. Access and Hooks export the
  extension-target helpers and contexts listed above.
- Typegen has no production extension-node renderer. It observes fields already
  merged into the final schema and used direct options. Its language-service
  tests and documentation nevertheless protect contextual extension binding,
  and generated Core schema contracts currently retain the base `extensions`
  property. Those tests and references are part of the removal audit.
- Query surface declarations also use a property named `extensions`, but those
  values are versioned `QueryBuilder` factories exposed as callable methods on
  application-owned schema handles. They are a different contract and remain
  unchanged by this decision.

## Decision

### One schema contribution vocabulary

Plugins use exactly the mechanism matching the behavior they own:

| Need                                                      | Contract                                     |
| --------------------------------------------------------- | -------------------------------------------- |
| Configure an existing schema or field                     | A direct plugin-owned schema or field option |
| Introduce a distinct logical field value                  | A plugin-defined field kind                  |
| Add or transform fields, indexes, options, or constraints | An owner-attributed schema patch             |
| Connect plugins or materialize behavior                   | A versioned capability                       |
| Add callable query methods to an application handle       | A query surface extension                    |

There is no generic metadata bag, renamed extension tuple, arbitrary symbol
map, or second option container. Schemas and fields expose no `extensions`
property after migration.

Direct options remain ordinary named properties. A used option resolves to one
exact installed definition owner. Missing owners, ambiguous definitions from
multiple plugin instances, malformed values, owner conflicts, and unknown
properties fail during static compilation before setup or infrastructure.
Installing or importing a package does not silently set an option value.

Typegen emits option augmentation only for the installed application graph.
JavaScript and Typegen-free applications compile the same option definitions at
Runtime. Package import alone still installs no behavior.

### Structural fields reuse option selection and ordinary patches

An option definition does not gain a `fields`, `contributions`, or arbitrary
transform callback. Such a facility would duplicate schema patches, broaden
the option contract, and create a second structural ordering model.

Instead, a plugin declares its direct option, selects schemas where that option
is present, and applies the existing `addSchemaField()` or `addSchemaIndex()`
patch under `schema:declare`:

```ts
declare: ({ schemas }) => {
	schemas.defineOptions({
		contributionId: 'document-options',
		schema: { document: documentOption },
	})

	const targets = schemas.select({ option: { name: 'document' } })
	schemas.patch({
		targets,
		operations: [
			addSchemaField({
				contributionId: 'document-state',
				name: 'documentState',
				field: stringField({ validation: { required: true } }),
			}),
		],
	})
}
```

Core adds an option-presence selector form `{ option: { name } }`. The existing
`{ option: { name, path?, equals } }` form remains structural-JSON equality.
Presence inspects only whether one normalized direct option occurrence exists;
it never resolves, serializes, compares, or executes an opaque callback value.
Nested-path presence is not introduced without a concrete consumer.

Option definitions are resolved and values normalized before selector results
are frozen. Each plugin's selectors retain ADR-0192 ordering: they observe the
graph completed by earlier plugins before the current plugin's patches, and
patches then apply in registration order. An option-presence selection cannot
grow because of a later patch from the same plugin.

The added field is an ordinary field node with the patch owner's provenance.
It participates in validation, generated inputs and outputs, persistence,
adapter compilation, migration snapshots, and application isolation without an
extension wrapper. Developer, system, prior-plugin, or same-owner collisions
fail through the existing field patch rules.

### Callback and compiler boundaries

Callback-bearing direct options use the existing `valueKind: 'opaque'`
contract. Their owner normalizes the callback declaration, Core stores the
trusted value as an application-local nominal artifact, and the callback never
enters JSON fingerprints, Typegen output, or the public compiler IR. Runtime
compilers and hosted engines execute callbacks through their existing
application-bound attribution.

Adding option-presence selection is a breaking input change to the complete
public compiler protocol. Issue 1902 advances the schema compiler IR and
`schemaCompilerCapability` together from 2.0.0 to 3.0.0. Protocol 3 carries the
new selector and temporarily retains extension nodes because the ordered
official migrations have not run yet. Core does not decode protocol 2.

After ACL, PostgreSQL, and Roles migrate, issue 1906 advances both contracts
from 3.0.0 to 4.0.0 and removes the `'extension'` artifact kind, extension
node, schema extension list, and extension patch operations. Core does not
decode protocol 3 after that boundary. The temporary protocol-3 representation
is the current implementation needed by unmigrated packages, not a public
compatibility alias or a second authoring syntax.

The Typegen snapshot format currently contains only final fields and used
direct options, not extension nodes, so its structural snapshot version remains 6. The generator version advances because generated public schema contracts
and plugin option surfaces change. Deterministic fingerprints reject stale
output normally.

### Ownership, removal, and application isolation

Direct option definitions, selections, and patches retain the exact plugin ID,
optional instance ID, package version, protocol version, stable contribution
ID, and normalized static options already required by ADR-0192. Configuration
order never selects a winner for an ambiguous option.

Removing a plugin makes its direct option unknown in the current source graph.
Removing a persisted field contribution leaves orphaned historical provenance
for the selected migration owner; it never authorizes Core or a database plugin
to drop data automatically. The migration from extensions changes declaration
representation, not the established destructive-migration policy.

Every definition, normalization, selection, patch, opaque artifact, compiled
schema, and Runtime compiler remains application-local. Two applications may
use different option values or plugin instances without sharing a registry,
callback, field contribution, or selector result.

## Official migrations

### Persisted ACL

`@ultimabase/acl-permissions-plugin` declares the direct schema option `acl`.
Its public option type is contextual through `SchemaOptions<this>`, following
the existing Access and Hooks pattern, so default and input-resolution callbacks
receive exact sibling developer fields without `bind()`.

The ACL plugin selects the presence of `acl` and adds the existing reserved ACL
plugin field with one ordinary owner-attributed patch. Policy, input resolution,
cleanup, limits, and events read the normalized direct option occurrence. The
logical field, persisted JSON, protected constraints, transactions, and
security semantics do not change.

The migration removes `acl()`, `aclSchemaExtensionName`, contextual binding,
and ACL schema-extension types in the same issue. The target authoring is:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		visibility: field.string(),
	}),
	acl: {
		default: ({ data }) =>
			data.visibility === 'public' ? new ACL().grantPublic('read') : new ACL(),
	},
})
```

### PostgreSQL metadata

`@ultimabase/postgres-plugin` declares `postgres` independently in the schema
and field option scopes:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ postgres: { renamedFrom: 'headline' } }),
	}),
	postgres: { table: 'posts' },
})
```

The schema option preserves exact escaped table naming; the field option
preserves explicit rename intent. PostgreSQL reads only its normalized direct
options. `postgresTable()`, `postgresColumn()`, their names, extension types,
and readers are removed atomically. Core gains no database vocabulary.

### RoleSchema identity

`RoleSchema.define()` already records its exact generated class in a
package-private `WeakMap`; Roles Runtime behavior uses that nominal declaration,
not structural extension matching. That map remains the canonical unforgeable
role-domain identity.

A package-created nominal direct schema option marks the declaration as
requiring `rolesPlugin()`, so registering a RoleSchema without its plugin still
fails static compilation. The marker's normalizer accepts only package-created
values, and its Typegen contract is opaque to application authors. Copying a
plain object cannot create role behavior. The unused `transportVisibility`
extension config is removed without replacement; a future transport policy
must use a real transport-owned contract when one exists.

The public `roleSchemaExtensionName`, implicit extension insertion, and
extension acceptance on `RoleSchemaOptions` are removed. Ordinary direct plugin
options such as Access, Hooks, and PostgreSQL remain supported by their actual
properties.

### Access and Hooks provider targets

`schemaExtensionAccess()`, `fieldExtensionAccess()`, and
`schemaExtensionHooks()` have no production consumer and are removed with their
target types. They are not generalized under a new name.

Compatible providers retain direct schema and field targets, field-kind
targets, explicit schema selectors, and capabilities. A provider that owns a
direct option may compile each option occurrence into its engine's contribution
capability through the option Runtime compiler. Independent engines retain the
generic Core capability and Runtime boundaries.

## Required regression matrix

Issues 1902 through 1907 must cover all of the following:

- option-presence selectors accept normalized JSON and opaque values, preserve
  deterministic ordering, produce frozen application-local results, and reject
  unknown, ambiguous, forged, and missing option definitions;
- compiler IR 3.0 adds callback-free option-presence selection and rejects
  protocol 2; final IR 4.0 contains only option, field, index, constraint,
  schema, and patch facts required by the extension-free graph, rejects
  protocol 3, and exposes no extension artifact or callback;
- source and packed language-service tests prove options are absent without the
  configured plugin contract and exact with it, including contextual ACL
  sibling-field inference and PostgreSQL schema and field options;
- JavaScript and Typegen-free applications execute the same normalized option
  and field-patch graph without generated Runtime code;
- ACL preserves every public, authenticated, principal, role, relationship,
  mutation, cleanup, event, rollback, Master, limit, malformed-input, and
  application-isolation security path;
- PostgreSQL unit, migration, synchronization, archive, and Testcontainers
  tests preserve exact identifier escaping, table naming, column rename data,
  nested field validation, and application isolation;
- RoleSchema tests preserve exact member-domain identity, missing-plugin
  failure, hierarchy, cleanup, Access, Hooks, PostgreSQL persistence, Typegen,
  and rejection of forged declarations;
- one unrelated community fixture proves a direct schema option, a direct field
  option, a plugin field, option-presence selection, and an ordinary structural
  field patch without a metadata bag;
- public exports, compiler contracts, source and packed declarations, package
  archives, manifests, static conformance snapshots, examples, active docs,
  and deep-import guards contain no schema-extension or field-extension surface;
  and
- `constraints`, typecheck, unit and type tests, lint, formatting, build, public
  E2E, packed-package, Typegen, JavaScript, and PostgreSQL Testcontainers gates
  pass after the complete removal.

## Consequences

- Plugin authors choose one mechanism by intent instead of deciding between an
  extension and a direct option for the same configuration.
- ACL keeps its concise schema-local configuration and reserved field without
  a special Core contribution primitive.
- PostgreSQL metadata becomes ordinary installed-plugin configuration with the
  same missing-owner and Typegen behavior as Access and Hooks.
- The complete compiler and provenance model lose a parallel artifact family.
- Query surface extensions remain clearly separate callable schema-handle
  methods.

## Rejected alternatives

### Add structural contributions to option definitions

This duplicates existing owner-attributed patches and creates another ordering,
conflict, compiler-IR, and provenance path. Option presence plus an ordinary
patch proves the current ACL need with less public API.

### Rename extensions to metadata

This preserves the generic bag and all of its ambiguity while only changing the
word. Direct options already provide typed metadata with ownership.

### Keep field extensions for physical adapter metadata

PostgreSQL is their only official production creator. A direct field option is
more precise, fails when PostgreSQL is absent, and keeps Core adapter-neutral.

### Keep extension target helpers for possible community consumers

No production consumer proves that need. Direct targets, field-kind targets,
option Runtime compilers, selectors, and capabilities cover the current cases;
speculative compatibility does not justify retaining a second targeting model.

## Non-goals

- Renaming or removing query surface extensions.
- Changing plugin-field, capability, Access, Hooks, ACL permission, role,
  migration, transaction, or Master semantics.
- Adding nested option-presence selectors or arbitrary executable selectors.
- Providing source or Runtime compatibility for removed extension APIs.
