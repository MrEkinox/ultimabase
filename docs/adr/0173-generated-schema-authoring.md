# ADR-0173: Generated schema authoring and static compilation

- Status: accepted
- Date: 2026-08-09
- Refines: ADR-0002, ADR-0022, ADR-0029, ADR-0048, ADR-0050, ADR-0088, ADR-0109, ADR-0130
- Refined by: ADR-0175, ADR-0177

## Context

Application schemas currently resolve complete field maps while
`Schema.define()` is evaluated. Recursive conditional inference then carries
those maps through models, Query, mutations, Access, hooks, objects, pointers,
and relations. The runtime definitions are precise, but stable TypeScript
versions cannot always contextually complete nested Access and hook objects,
and large inferred surfaces repeatedly expand the same field graph.

A plugin-defined logical field has a second problem. Core can accept its opaque
runtime definition, but application code cannot write `field.vector()` unless
Core knows that method or the developer supplies a manual type. A global
registry would leak methods between applications, while resolving the field
callback during module evaluation happens before the configured plugin graph is
known.

Issue 801 proved that a deferred callback, an application-owned method registry,
and compact generated declarations can expose exact editor contracts on the
supported stable TypeScript compiler. It also demonstrated one unavoidable
boundary: an exact model cannot be constructed before an application has
compiled the deferred schema.

## Decision

### Static declarations remain authoritative

`Schema.define()` continues to be the single schema declaration entry point,
but `fields` becomes one synchronous declaration callback:

```ts
export const Document = Schema.define({
	className: 'Document',
	fields(field) {
		field.string('title', {
			validation: { required: true },
		})
		field.vector('embedding', {
			dimensions: 1536,
		})
	},
})
```

Module evaluation validates and snapshots declaration-level options, retains
the callback, and creates the final schema-class identity. It does not execute
the callback or manufacture a preliminary field map. Generated files are
derived caches; they never replace the TypeScript declaration as the source of
runtime schema truth.

Field callbacks are synchronous, deterministic declarations. They may close
over static application values and lazy schema targets, but must not depend on
requests, services, adapters, transactions, clocks, network state, or plugin
lifecycle state.

### Application static-compilation pipeline

Each application compiles schemas through this ordered, infrastructure-free
phase:

1. normalize the application configuration and resolve its deterministic plugin graph;
2. create a new application-owned, owner-scoped field-method registry;
3. register Core builder methods under the Core owner;
4. invoke each plugin's synchronous pure field-declaration contribution in resolved graph order;
5. allocate every configured schema identity before resolving fields;
6. execute each schema field callback exactly once for that application-compilation attempt, using the completed registry;
7. normalize, validate, snapshot, and freeze every produced field definition through the existing field factories;
8. resolve lazy pointer and relation targets, validate names, indexes, extensions, Access, hooks, generated identities, and circular references against the complete graph;
9. atomically bind the complete compiled definitions to their schema classes and expose one immutable application schema snapshot;
10. only then allow plugin setup, infrastructure connection, Runtime assembly, transports, or code generation to consume that snapshot.

Plugin field declaration is distinct from plugin `setup`. It receives only an
owner-bound declaration registrar and frozen static plugin options. Core injects
the owner, rejects built-in overrides and duplicate names, and records a stable
semantic identity for the field factory and its typegen description. It never
hands this phase a service registry or lifecycle capability.

Compilation is all-or-nothing. A missing method, conflicting contribution,
invalid target, class-name collision, or incompatible generated identity leaves
every previously unresolved class unresolved and fails before infrastructure
starts.

### Model construction and static metadata

The class returned by `Schema.define()` has stable identity and exposes its
`className` immediately. Before a successful application static compilation:

- `new Model(values)` fails with an actionable schema-not-compiled error;
- static `fields`, `definition`, and other field-dependent metadata fail with
  the same boundary;
- the retained declaration callback is not public metadata and cannot be
  invoked by application code.

After the complete application schema graph has compiled, model construction,
static metadata, Query, mutation commands, materialization, and immutable
instance behavior follow ADR-0109 and its refinements. Construction remains
pure and performs no I/O.

The first successful compilation binds one canonical frozen definition to a
schema class. Another isolated application may reuse that exact class only when
its independently resolved definition is structurally identical. An
incompatible plugin owner, field method, target, or field result fails instead
of leaking the first application's definition. Unused differences in the two
plugin graphs are permitted when they do not change the compiled schema.

### Relationships, identities, and application isolation

Every schema class is registered before any field callback executes. Pointer
and relation methods retain lazy target class identities during field
resolution, then validate them after the complete graph exists. Circular
pointer and relation graphs are therefore supported. Embedded objects remain
finite value trees and retain the restrictions from ADR-0165.

Class names must be unique within one application and within one generated
TypeScript registry. Reusing a generator-neutral `typeName` follows ADR-0022:
compatible reuse is valid and incompatible reuse is a generation error.
Different applications may use the same names when they compile and generate
into separate application scopes.

Runtime field-method registries, compiled schema graphs, and generated outputs
are application-owned. There is no mutable process-global FieldBuilder or
schema registry. A TypeScript project that intentionally combines several
applications must either generate one collision-free combined registry or give
each application a separate TypeScript project and generated type root.

### Generated application contracts

One application registry contains compact named contracts for FieldBuilder
methods, models, operation inputs, where, order, select, include, Access, hooks,
embedded objects, pointers, and relations. Core public APIs look up those
contracts by the literal schema class name, so application code does not pass a
manual type registry or write a generic such as `<TypeInfo, 'Document'>`.

Each `Schemas.<Name>.TypeInfo` entry is the source of truth for the public item
and operation inputs. The Core module augmentation references that entry rather
than repeating its types. It adds only private field metadata that cannot be
recovered reliably from TypeScript value shapes: logical kind, list depth, and
relationship target/cardinality. Access and hook views are derived from the
same item and input types instead of being stored again in the registry.

The generated registry preserves the runtime schema's exact enum literals,
required and optional state, list depth, immutable and generated fields, nested
objects, relationship targets, and plugin logical values. Shared public
operator contracts remain imports instead of being expanded once per schema.
The output contains no executable hook or Access callback, secret, request
state, adapter, Drizzle value, physical database metadata, or infrastructure
handle.

Generated pointer and relation surfaces correlate a target through its stable
application-local class name rather than an application source variable. This
keeps generated declarations independent from local symbol names and schema
extension tuples. Runtime relation mutations continue to verify the concrete
registered target identity before normalizing their operation.

This refines earlier inference decisions:

- ADR-0088's compact inference state remains the field-factory and generator
  input contract, but recursively inferred application surfaces cease to be the
  final public typing source after migration;
- ADR-0130's contextual extension syntax remains valid, while generated sibling
  contracts replace backward propagation through the complete field map;
- ADR-0022's generator-neutral identities become inputs to deterministic named
  application declarations;
- ADR-0109's single class identity and immutable model behavior remain, while
  immediate pre-application construction and its no-codegen typing assumption
  are replaced by the accepted static-compilation boundary.

### Generation, invalidation, and deployment

The generator loads the application configuration through TypeScript
transpilation, without requiring the old generated registry to typecheck first.
It runs only the static plugin declaration and schema-compilation phases. It
does not initialize services or start infrastructure.

Every output carries a deterministic fingerprint of the generator and Core
contract versions, application identity, normalized plugin declaration graph,
compiled schemas, generated identities, and relevant output options. Ordering,
formatting, file names, and content are deterministic. A successful generation
atomically replaces the complete application-owned artifact.

Before compiling changed inputs, generation atomically invalidates the previous
fingerprint so a failed attempt cannot leave stale declarations accepted as
current. Missing plugins and removed field methods therefore produce an
explicit generation/startup failure rather than silently retaining the old
capability. The invalid state may expose the newly discovered FieldBuilder
method set to improve recovery, but it cannot satisfy the complete generated
application registry. Once invalid declarations are corrected, the next full
generation omits every removed plugin method and contract.

The first generation may begin while TypeScript reports an unresolved plugin
method. Transpilation still loads the deferred declaration, the configured
plugin contributes the method before field resolution, and the completed output
then supplies exact editor types. Development startup and source-mode startup
perform one complete generation before running the application. Typecheck and
build either generate first or use a check mode that rejects missing or stale
artifacts.

Production deployments with read-only filesystems generate during build and
ship the artifact and fingerprint with the compiled application. Startup
recompiles the static graph in memory and verifies the shipped fingerprint; it
does not write into source, package, or installation directories. Missing,
incomplete, or stale artifacts fail with an actionable diagnostic.

In writable development environments, the application configures
`codegenPlugin()` from `@ultimabase/codegen`. `UltimaBase.start()` first compiles
the static graph, then the plugin atomically regenerates the complete declaration
during setup before any infrastructure connection. Core exposes only the
read-only compiled schema and application-local FieldBuilder method graph to
the plugin and never imports codegen. The future CLI remains a separate manual
entry point for generation, check mode, and watch mode; it is not required for
normal startup generation.

The codegen package owns application discovery, deterministic emission,
atomic replacement, and conflict diagnostics. Core owns only the static
compilation snapshot and neutral contribution contracts. Issue 806 supersedes
the earlier generic-orchestrator issue 718 with the smallest orchestrator needed
for this concrete schema registry; arbitrary generator extension points are not
introduced without another proven consumer.

### Non-goals

This decision does not introduce:

- incremental graph generation or a persistent incremental cache;
- a mutable global FieldBuilder, plugin, schema, or generated-type registry;
- a TypeScript compiler or language-service plugin;
- runtime source rewriting, decorators, or executable generated business code;
- transport-specific GraphQL, REST, OpenAPI, or SDK contracts;
- a public `field.custom()` as the ordinary application declaration path;
- automatic infrastructure setup during generation;
- compatibility between independently generated registries that assign one
  class name or generated identity to incompatible definitions.

## Evidence

[Issue 801](../../issues/800-generated-types/801-deferred-schema-typegen-proof.md)
records the disposable proof that established the lifecycle boundary,
stable-TypeScript editor behavior, first generation through transpilation,
plugin isolation, deterministic conflicts, and compatible schema reuse. The
prototype implementation was removed after the production contracts superseded
it. Those contracts are protected by the focused
[schema compilation](../../packages/core/src/schema/schema/compilation.test.ts),
[plugin FieldBuilder](../../packages/core/src/schema/schema/plugin-field-builder-methods.test.ts),
[codegen loader](../../packages/codegen/src/loader.test.ts), and
[generated public type](../../tests/e2e/codegen-generated-types.e2e.test.ts)
regression suites.

The historical prototype did not prove a TypeScript memory improvement. Issue
810 must measure separate representative processes before this project claims
one.

## Consequences

- Application declarations gain Nexus-style field methods and exact plugin
  autocomplete without a manual application generic.
- Stable TypeScript receives compact named contracts instead of repeatedly
  expanding the complete recursive schema graph.
- Core remains independent from concrete field, database, and transport
  plugins, while plugin ownership and conflicts fail before infrastructure.
- Schema classes stay the public identity, but drafts cannot be constructed at
  module evaluation before an application compiles their schema graph.
- Applications and generated projects remain isolated; sharing one schema class
  across applications is intentionally stricter than sharing two equivalent
  declarations.
- Full regeneration and explicit stale-state failure favor correctness and
  understandable recovery over an unproven incremental implementation.

## Issue 809 clarification

The canonical application syntax remains the deferred `fields(field)` builder.
Because UltimaBase has no published application surface to migrate, issue 809
does not add a codemod or remove the field-map implementation. Internal tests
and framework-owned composition may retain field maps when they require exact
local inference across independent fixtures. Ordinary application documentation
does not present that lower-level form as an alternative authoring style.
