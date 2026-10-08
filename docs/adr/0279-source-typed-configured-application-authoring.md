# ADR-0279: Configured applications own source-typed authoring

- Status: accepted
- Date: 2026-09-29
- Supersedes: the authoring and application-selection clauses listed below
- Approval: user approved the source-typed configured-application target after issue 6301 proved its TypeScript feasibility and limits
- Decision issue: 6302 (archived at tag `reference-archive`: `issues/6300-source-typed-application-authoring/6302-source-typed-application-adr.md`)
- Proof: issue 6301 benchmark (archived at tag `reference-archive`: `issues/6300-source-typed-application-authoring/evidence/6301-hybrid-benchmark.md`)

## Context

UltimaBase currently describes one application through several developer and
plugin-author mechanisms. Plugins are installed on an application instance,
ordinary schemas are declared through a standalone `Schema`, exact
application surfaces are expanded into generated declarations, and some
direct class commands require an explicit `{ ultimabase }` selection outside a
request. The Runtime compiles one deterministic application graph, but the
authoring API makes developers and plugin authors repeat parts of that graph.

That repetition is especially costly for plugin-owned field builders, direct
options, schema mutations, model commands, application operations, and package
schemas. A plugin can already declare the Runtime behavior, yet it also needs a
parallel Typegen projection before the same surface appears on application
types. The generated expansion grows with the number of schemas even when the
installed plugin contract is identical.

One part cannot be recovered safely from an individually inferred schema:
exact string relationship targets form an application-specific name graph.
Circular and cross-file relationships need that graph, and export identifiers
cannot replace Runtime `className` values because UltimaBase deliberately
allows them to differ. Source-only experiments produced TypeScript circular
initializer diagnostics when they attempted to infer the graph from mutually
referencing schema constants.

Issue 6301 proved a narrower boundary: plugin surfaces can be projected from
the installed plugin definitions while Typegen remains the sole exact
name-to-schema graph. The proof preserved diagnostics, completion, hover,
Runtime compilation, package specialization, plugin absence, and JavaScript
behavior without adding a second registry or mutating schema classes late.

## Decision

### One immutable configured application factory

`UltimaBase` is the zero-plugin configured application factory. Installing a
plugin returns a new configured factory and never mutates an earlier one:

```ts
const Blog = UltimaBase.use(postgresPlugin({ url }))
	.use(softDeletePlugin({ defaultMode: 'explicit' }))
	.use(accessPlugin({ default: false }))
	.use(hooksPlugin())
```

The chained tuple is the sole public plugin installation form. It preserves
the flat ordered plugin graph: a definition cannot contain nested plugins, and
`.use()` does not create a second Runtime graph. Stable plugin ID, optional
instance ID, dependencies, peers, privileges, capabilities, deterministic
ordering, setup, and reverse teardown retain their existing meanings.

`new UltimaBase({ plugins: [...] })` is removed after the bounded repository
migration rather than retained as an alias. Core's existing `plugin(...)`
lookup remains an advanced application-instance access boundary; it is not an
installation form.

### Schema declaration and registration

Each configured factory exposes its own typed `Schema` namespace:

```ts
const Post = Blog.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
	softDelete: true,
})

const application = new Blog({ schemas: [Post] })
```

`App.Schema.define()` retains the existing object declaration shape. It is
pure and inert: it does not register the schema, run plugin code, validate
privileges, select authority, connect infrastructure, or start an application.
The explicit `schemas` array remains the sole Runtime registration root.
Imports therefore have no registration side effects.

`UltimaBase.Schema.define()` declares portable Core-only schemas through the
same mechanism. Package-owned specialized schemas continue through Core's sole
`Schema.defineSpecialized()` implementation, but configured factories project
their exact source types through the same compiler. This does not create a
second public schema compiler.

A zero-plugin portable schema can be registered by a configured descendant
without gaining plugin-only source members. Existing application-wide plugin
behavior still applies in Runtime, and its advanced application handle retains
conditional commands when needed. Application code that wants direct
plugin-specific members declares the schema through that configured factory.

Schema classes and immutable result models remain frozen. Core never appends
methods to an exported class or prototype after definition.

### Source-owned plugin surfaces

A plugin definition carries the source-level projection of the public surface
that its existing authorized declaration contributes. The immutable plugin
tuple accumulated by `.use()` determines the exact builders, direct schema and
field options, fields, schema mutations, model commands, application
operations, Password User methods, Roles surfaces, and specialized schema
surfaces available from that configured factory.

The projection is a type-level view of the same static definition, not a
second declaration registry. Core stays product-neutral and never imports
Plugin Kit or a concrete plugin. Plugin Kit may provide helpers, but Core's
ownership, privilege, provenance, identity, conflict, and capability checks
remain authoritative. An absent plugin removes its surface from completion and
produces a focused TypeScript diagnostic; JavaScript misuse still fails at the
same Runtime checks.

Plugin authors no longer repeat source-derivable surfaces in manual or
structured Typegen declarations. The compiler continues to authorize and
freeze one ordered application graph before application resources are
materialized.

### Typegen owns only application-specific named resolution

`@ultimabase/typegen` remains optional development tooling and retains the
application-specific mapping from each literal relationship target to its
exact schema contract. That generated name graph is the sole authority for
circular and cross-file schema-name resolution. Runtime registration still
comes from `new App({ schemas: [...] })`, not from the generated file.

Typegen remains deterministic, inert, replaceable declaration output. It does
not become Runtime truth, execute plugin behavior, emit JavaScript, create an
application client, or own a second plugin graph. Plugins cannot add a parallel
source name registry, ambient application augmentation, manual declaration
fragment, or extra output.

Other generated schema contracts remain until a later measured removal proves
each one redundant. This decision removes only Typegen copies of surfaces that
the installed plugin source definition can express exactly.

### Direct execution uses the sole active owner

Direct static schema methods and immutable model commands resolve the sole
active initialized application in the JavaScript realm. Ordinary calls do not
repeat `{ ultimabase }`. Every call verifies that the active application's
compiled graph owns the exact schema and command before entering the same
canonical handle and Runtime pipeline.

The class and model retain no application resource, adapter, credential,
transaction, request subject, or Master authority. A persisted result may
retain inert owner provenance so stale and foreign results remain detectable;
that provenance is not an executor or application reference. Calls before
start, after disposal, through stale request state, or against a foreign
configured application fail before effects. Concurrent requests keep their
request-local context, transaction, cancellation, subject, and Master
provenance. Internal application handles remain only where they enforce
ownership or support an existing advanced capability; they are not a second
ordinary developer API.

### Compilation, lifecycle, and security invariants

The configured factory exposes compile-time information before initialization,
but no plugin static declaration or effect runs before the existing privilege
policy has validated every requested privilege. Pure compilation still
normalizes one authorized flat graph, exact plugin instances, deterministic
order, owner provenance, declarations, commands, and inert transport metadata.
Application materialization then binds resources and lifecycle behavior.

One initialized application per JavaScript realm, sequential replacement after
successful disposal, request isolation, automatic transactions, immutable
builders and models, protected constraints, canonical commands, and audited
Master authority remain unchanged. JavaScript applications compile and execute
the same graph without Typegen or generated artifacts.

## Superseded clauses

The following earlier records remain historical evidence and retain every
capability not explicitly replaced here:

- ADR-0173's rule that the generated registry is the authoritative application
  authoring surface is replaced by configured source authoring; Typegen retains
  only exact named cross-schema resolution and still describes the compiled
  graph.
- ADR-0175's map-returning field declaration and one-shot capture remain; its
  rule that plugin-contributed builders and all locally decidable precise types
  resolve authoritatively from the generated registry is replaced by configured
  source projection. Generated schema contracts still own exact named
  cross-schema resolution and any other output not removed by this decision.
- ADR-0184's package identity, generator, loader, snapshot, writer, output, and
  replaceable declaration rules remain; its assumption that complete precise
  application authoring requires generated expansion is narrowed to the named
  schema graph.
- ADR-0187's pure plugin-owned compilation and Typegen-before-infrastructure
  rules remain; its plugin-authored generated copies of source-derivable
  surfaces are removed.
- ADR-0192's ownership, deterministic transformations, and model capabilities
  remain; ordinary plugin surfaces are projected from the configured factory
  rather than requiring generated application-handle declarations.
- ADR-0197's application-local isolation and exact owner checks remain; its
  generated ordinary handle surface and explicit selection requirement are
  replaced by configured source types and sole-active-owner resolution.
- ADR-0198's structured, inert, application-local Typegen contract remains for
  facts not derivable from plugin source and for the retained schema-name
  graph; plugin-authored copies of builders, options, methods, mutations,
  commands, and operations are removed.
- ADR-0201's immutable application-bound model results and direct commands
  remain; their exact plugin surfaces come from source projections rather than
  repeated generated declarations.
- ADR-0248's frozen-class mutation syntax and canonical Runtime delegation
  remain; ordinary calls resolve the sole active owner instead of accepting an
  explicit `{ ultimabase }` selector or accumulating visibility from multiple
  applications.
- ADR-0254's Password User methods, operation semantics, and security checks
  remain; ordinary static calls no longer require `{ ultimabase }` outside a
  request and use the same sole-active-owner resolution.
- ADR-0258's one-active-application lifecycle and request isolation remain; its
  prohibition on implicit outside-request application resolution is replaced
  by exact resolution of that already-exclusive active owner. No global
  request, user, transaction, credential, or authority is introduced.
- ADR-0262's callback-free descriptive inspection and canonical command
  identity remain; source-derivable plugin surfaces need not be emitted by its
  Typegen view.
- ADR-0265's removal of the emitter marker and Typegen-free JavaScript behavior
  remain; no marker or conditional Runtime path is reintroduced.
- ADR-0267's flat graph, uniform advanced lookup, identity, ordering, and
  lifecycle rules remain; root constructor plugin installation is replaced by
  immutable `UltimaBase.use()` chaining.
- ADR-0273's one canonical plugin field-family Runtime declaration, ownership,
  and provenance remain; its builder, options, and value contract are projected
  from that source definition without a separate Typegen authoring copy.
- ADR-0276's sole public application owner and hidden engine/runtime assembly
  remain; configured descendants are immutable factory types whose instances
  are still `UltimaBase` owners, not another public application abstraction.
- ADR-0277's single `Schema.defineSpecialized()` implementation and ordinary
  `Schema.define()` path remain; configured `App.Schema` is the ordinary typed
  projection of the same compiler, not a second specialization mechanism.

## Evidence and continuing budgets

Issue 6301 measured current and hybrid forms in fresh isolated processes while
loading the same production package declarations. At 50 schemas, the hybrid
proof changed median cold checking from 5,756.52 ms to 2,846.92 ms (-50.5%),
complete edit-to-diagnostic latency from 3,941.58 ms to 1,444.77 ms (-63.3%),
declaration output from 661,736 to 143,546 bytes (-78.3%), and peak heap from
1,176.10 to 501.07 MiB (-57.4%). Language-service initialization changed from
364.55 ms to 325.22 ms, generation from 86.29 ms to 92.36 ms (+7.0%), and all
warm completion, hover, and diagnostic p95 measurements remained below 1 ms.
Every initial diagnostic count was zero and every invalid edit produced exactly
one focused diagnostic.

Migration issues must repeat the same 1-, 10-, and 50-schema measurements:
declaration bytes, cold check, language-service initialization, complete
edit-to-diagnostic latency, warm completion/hover/diagnostic p95, peak heap, and
generation. Results are compared with both the original baseline and the prior
migration point so a local regression cannot be hidden by a favorable final
total. The accepted issue-6301 performance, memory, declaration, hover, and
complexity limits remain architecture stop conditions.

## Consequences

- Developers use one plugin installation form, one schema declaration form,
  explicit schema registration, and direct class/model execution.
- Plugin authors declare each public capability once beside its Runtime
  definition instead of maintaining a Typegen copy.
- Typegen remains necessary, but its irreducible responsibility is explicit
  and bounded to application-specific named schema resolution unless later
  evidence justifies another retained output.
- TypeScript evaluates shared plugin projections rather than repeatedly parsing
  expanded per-schema plugin surfaces.
- The production migration must remove superseded branches and exports instead
  of leaving a compatibility facade or second internal graph.

## Rejected alternatives and non-goals

- Repeating `.use()` on every schema is rejected because application-wide
  plugin configuration would become developer duplication.
- Automatic schema registration and import side effects are rejected because
  declaration must stay pure and the application root explicit.
- A callback that declares every schema inside application construction is
  rejected because it cannot express the existing circular inference contract
  without changing the approved schema shape.
- A source-module or ambient schema registry beside Typegen is rejected because
  it duplicates the name graph and fails when export names differ from
  `className`.
- Late class/prototype mutation and a generated Runtime client are rejected.
- This decision does not add PostgreSQL vector persistence, weaken privileges,
  change Runtime order, or remove any functional plugin, transport, schema,
  command, security, lifecycle, JavaScript, or community-authoring capability.
