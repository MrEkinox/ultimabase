# @ultimabase/core

## 1.0.0

### Major Changes

- 206bec5: Restrict `jsonField` roots to `JsonObject | JsonArray` while retaining every
  portable JSON value recursively.
- c7f1d33: Replace magic temporal default strings with explicit scalar `autoNow` generation
  metadata and operation-aware inference.
- 235040c: Organize field Access around grouped read disclosure and typed fill, replace,
  clear, and relation-write decisions, including item-aware bulk enforcement.
- b8cbf6e: Replace the `defineSchema` factory with the immutable `new Schema(options)`
  constructor while preserving schema inference and runtime validation.
- 41e0fbb: Remove the deprecated `SchemaWhereFactory`, `QueryIncludedPointerFromInput`,
  and `OperationIncludedPointer` type aliases in favor of their canonical Query
  type names.
- 222377f: Rename schema collection commands to `createOne` and `upsertOne`, rename Query
  terminals to `findOne` and `findMany`, and align read Operation AST kinds with
  the same explicit cardinality vocabulary.
- 82dc312: Consolidate Schema, Query, Access, application orchestration, and Runtime under
  the single `@ultimabase/core` public entry point. Official plugins now depend on
  that cohesive foundational package instead of synchronized internal packages.
- 92969f9: Replace schema instances with constructible classes returned by `Schema.define`,
  add immutable typed drafts and static Query access, and materialize public
  Runtime results as exact schema-class instances after output restrictions.
- b872410: Replace duplicated scalar and plugin validation-plan metadata with structural
  plans that retain each declared field by identity.
- 4978621: Add exact result selections to immutable model create, upsert, update, and
  delete commands, align their command envelopes with static mutations, and make
  instance upsert accept the shared object or builder `where` contract.
- 6681117: Limit field defaults to static values and zero-argument runtime factories, and
  remove database-specific default contracts from Schema and validation plans.

### Minor Changes

- 4d9cfbf: Execute compiled native Access operation, row, item, and field policies through
  the monotonic Runtime pipeline and private database request boundary.
- 2d89051: Add isolated framework applications with typed schema and plugin export lookup.
- 629948d: Add typed bulk and unique-target upsert terminals with ordered results and
  automatic transactions for atomic bulk create and upsert.
- 7d01386: Add application-isolated versioned adapter constraint compilers with safe parameterized PostgreSQL predicate composition.
- fa5fe82: Add immutable string enum fields from literal lists, native string enums, and symbolic key-value mappings with exact union inference.
- 87bdad1: Add typed schema-extension field contributions and the optional ACL schema
  extension with immutable defaults, explicit-input resolution, and concise
  object, create, and update inference.
- 74dc247: Add versioned opaque cursor payloads, mandatory UUID tie-breaking, protected
  codec boundaries, forward cursor pagination, and typed compatibility errors.
- 4d63866: Track expected extension plugins and validate their setup-owned handlers before
  infrastructure starts.
- c57b835: Add neutral contextual schema extension binding so callback options infer exact
  sibling developer fields without duplicated application data types.
- ac7554f: Add the class-based `UltimaBase` facade for isolated application lifecycle,
  Runtime assembly, and compact direct schema queries.
- 9db27e7: Replace mode-based number fields with dedicated integer and float factories,
  field kinds, option contracts, and validation plans.
- 64e22b0: Compose native schema and inline field hooks through ordered handler lists and
  typed `all` plus operation-family maps without duplicating singular and bulk
  declarations.
- abd708e: Execute schema, field, and plugin-native hook declarations through one compiled,
  transaction-aware Runtime lifecycle.
- 65b5c66: Add deterministic plugin graph resolution with typed dependency, duplicate,
  conflict, exclusive-slot, and cycle diagnostics.
- 9315355: Compose reusable selection-preserving Query scopes through immutable unbound and bound branches.
- 84a0186: Add isolated typed service registries with required and optional lookup,
  duplicate protection, stable errors, and standard resource disposal.
- 56024ac: Add selection-aware singular BoundQuery terminals backed by the Runtime
  operation pipeline.
- 54e784c: Use canonical typed `WhereInput` objects for schema Access row policies, retain
  the immutable `WhereBuilder` utility for dynamic composition, and recursively
  apply target Access to relationship predicates.
- 3a48ec6: Persist plugin-owned JSON values through versioned portable codecs, store ACLs
  as indexed row-local PostgreSQL JSONB, and resolve role names to stable UUID
  references before persistence.
- 7f569ec: Add versioned adapter support negotiation, attributed physical and migration
  bridges, revocable raw adapter leases, PostgreSQL bridge compilation, and an
  immutable migration-history test fixture.
- 4d24000: Expose typed required and optional application service lookup without exposing
  the mutable service registry.
- 0eacd98: Add exact native bigint fields with typed defaults, ranges, lists,
  auto-increment metadata, inference, and validation plans.
- 1806b81: Define typed stopped-prefix results and hook semantics for non-atomic create-many and upsert-many operations.
- aec4cd0: Add schema-checked selection and ordering normalization with validated offset
  pagination nodes.
- 331a76b: Make request identity plugin-owned through nominal validated context values,
  remove native user authority, and expose typed read access to hooks.
- 462a850: Add ordered plugin hooks and post-commit events, expose safe contribution
  snapshots, and allow bound terminals on request engines that own several
  schemas.
- a2b1717: Add the immutable Runtime-owned HookContext class with revocable typed nested
  queries, request capability checks, and transaction-bound named events.
- a6aa8da: Declare immutable, typed native schema hooks directly through `new Schema()`.
- 32767cf: Add deterministic plugin lifecycle orchestration with idempotent phases and
  reverse-order failure cleanup.
- 4bab922: Expose application-local plugin model commands as callable methods on immutable
  schema results while preserving explicit dynamic operation handles.
- 114d5a1: Add the mandatory typed Runtime pipeline with deterministic access, hook,
  database, commit, and post-commit ordering.
- 7aac6de: Add nested plugin normalization, implicit parent dependencies, duplicate
  definition protection, and exclusive plugin slots.
- 1850f1c: Replace named permission stages with policy-neutral monotonic enforcement hooks and generic database constraints.
- e21fffc: Add immutable selection-aware BoundQuery branches, explicit Query binding, and
  projected result inference without coupling Query to Runtime execution.
- e029de6: Add the typed immutable `byId(id)` builder alias to Query and BoundQuery.
- 65d47ee: Replace the two schema-specialization construction paths with the single typed
  `Schema.defineSpecialized()` boundary and migrate Password User and Role schema
  factories without changing their application-facing contracts.
- d8362f0: Add isolated AsyncLocalStorage request scopes and contextual engine helpers.
- 571f4bc: Add immutable nominal service tokens with exact service inference, diagnostic
  names, object identity, and an explicit single-provider policy.
- 6f9f2e1: Add provider-neutral transactional cleanup for exact principal and role
  references stored in indexed ACL documents.
- deef6c3: Declare exact-value inline hooks on every built-in and plugin-defined field
  without exposing callbacks through structural field metadata.
- 42e65b6: Harden runtime schema declarations, add field-aware structured default
  snapshots and namespaced plugin issue codes, and define replacement semantics
  for object lists in update inputs.
- b0f865e: Restructure native schema Access declarations around read, create, update,
  upsert, and delete operations, add direct typed row policies, and simplify field
  Access callback inputs and output disclosure naming.
- 2f6e99c: Add concise `update()` and `delete()` Query aliases while preserving explicit
  `updateMany()` and `deleteMany()` collection semantics.
- 684aa4b: Move every terminal operation onto the immutable `Query`, resolve active or
  explicit `UltimaBase` execution at call time, and remove the duplicated
  `BoundQuery` and context query facades.
- 0c03b5b: Add schema-typed terminal Operation AST contracts for singular reads and writes,
  bulk operations, upserts, counts, and existence checks without embedded authority.
- 0fc8343: Add typed pointer fields, immutable logical Pointer values, lazy target graph integration, and schema pointer conveniences.
- a217e52: Add exact owning and inverse relation field declarations with application-local
  topology validation and row-value omission.
- 82b71fc: Add immutable typed Relation handles and private relation-scoped target Queries
  to persisted schema models.
- 6115be0: Add immutable boolean and server-side Date fields with static defaults, precise inference, and declarative Date ranges.
- 849ac30: Group schema read cardinalities and field read disclosure channels while
  preserving concise shared rules. Operation callbacks receive only request
  context; named read branches and mutation properties replace internal terminal
  cardinality inference.
- 30920cc: Execute selection-preserving read hooks and safe field output resolution through the shared Runtime pipeline.
- 76f691d: Add schema-typed set, unset, increment, and decrement update expressions with
  deterministic normalization and conflict detection.
- dc472fc: Use one flat plugin list, add typed definition-based lookup and explicit schema
  claims, align ACL and Roles identities with their package names, register custom
  Password Auth Users at the application root, and export the complete immutable
  Password Auth operation list.
- 47e10e5: Add the immutable ACL grant API, neutral persisted-role reference carriers, and
  precise public IntelliSense for object-level rights.
- de8698c: Add closed request access modes, identity-based capability tokens, and immutable
  anonymous or authenticated Runtime request contexts with a private master boundary.
- 2635caa: Assemble a typed FrameworkEngine from application services, validation, hooks,
  events, and plugin-owned Runtime pipeline stages.
- 7d78026: Add exact application schema ownership plus immutable framework and
  request-bound execution engines.
- 1dfd965: Add typed framework errors with stable codes, native causes, separated public
  and internal details, and transport-neutral safe serialization.
- ac75b10: Add owner-scoped typed plugin hook targets for global, schema, field path,
  extension, and namespaced field-kind contributions.
- 190f5b2: Add the immutable schema-typed Query class with composable filters, selection,
  ordering, independent limits, and mutually exclusive offset or cursor positions.
- 74b91d6: Add nominal optional Access subject contracts, a neutral role-resolution
  service, and provider-order-independent plugin service requirements.
- 86c2d06: Add adapter-backed RequestEngine transactions with deterministic commit,
  rollback, lifetime, nesting, and post-commit semantics.
- 1b08f1c: Compile native and plugin-provided Access rules into immutable application
  plans with typed targets, explicit master behavior, and configurable defaults.
- b11c11f: Separate the shared query limit from mutually exclusive offset and cursor
  pagination positions.
- fd1a7fd: Add immutable typed plugin definitions with static setup exports, lifecycle
  hooks, dependency metadata, conflicts, and nested composition.
- 79487b0: Add shared Query terminal options for explicit plugin-derived contexts and
  audited master authority while preserving ambient hook and transaction scopes.
- e22a540: Expose one immutable proposed developer-data contract for ACL create and update
  input resolution, including normalized update intent and exact numeric changes.
- 9c4139e: Add application-local lazy schema target resolution with immutable graphs and
  typed setup diagnostics before relationship fields are introduced.
- fffc6c8: Replace `arrayField` with common typed `list` metadata on every developer field,
  including nested-list inference, defaults, and validation plans.
- b9b406c: Add typed result selections to upsert, create-many, and upsert-many commands,
  with canonical bulk command envelopes and PostgreSQL result projection that
  retains complete private mutation materializations.
- 753dc67: Add optional generator-neutral `typeName` metadata to enum and object fields.
- 8c799af: Add private, precisely typed native Access declarations to schemas and fields.
- 143502f: Remove the direct capability-inventory constructor and aggregate asynchronous
  context exports from Core's root. Capability inspection remains available via
  `PluginGraph.capabilities`, while focused contextual access remains available
  through `getCurrentUltimaBase()`, `getCurrentEngine()`, and
  `getCurrentRequest()`.
- e1f4c66: Add immutable recursive logical filters with deterministic normalization for
  and, or, not, constants, and redundant nesting.
- eba2dcf: Add schema-correlated primitive filter nodes with field-specific operators,
  inferred operands, and declarative regex patterns.
- 740d586: Add distinct calendar date, time, and date-time fields with timezone-aware
  formats, operation-clock defaults, typed ranges, inference, and plans.
- 25a4525: Move reads to canonical schema-root object commands, retain QueryBuilder as a
  non-executing composition utility, and expose direct pointer and relation reads.
- a34e05a: Emit typed structured ACL change events only after commit, expose materialized
  field item IDs, and compare opaque plugin values through their storage codec.
- c6c88c3: Add portable database adapter, transaction executor, access-constraint, and
  operation-specific result contracts.
- ed1192b: Add the generic immutable field definition and common field option contracts.
- fcf1a72: Add trusted optional and required committed-event contracts, preserving required
  delivery for legacy string emissions while allowing ACL and role notifications
  to run without synthetic consumers.
- f1c0d67: Execute PostgreSQL create-many, update-many, delete-many, upsert-one, and
  upsert-many operations through Runtime's prepared transaction protocol.

  Non-atomic create and upsert collections recover failed items through private
  PostgreSQL savepoints and return the typed successful-prefix result. Unique
  target equality values now seed the create candidate before hooks and reject
  contradictory create values.

- c7f1d33: Export the typed scalar snapshot boundary required by Runtime and plugin-owned
  logical values.
- 5e8d4e2: Protect hook execution with immutable recursion tracking, cooperative cancellation, transaction identities, safe execution context, and isolated redacted diagnostics.
- 552985c: Add framework-owned opaque master-key grants, mandatory elevation auditing, and
  an explicit permission-only master bypass policy.
- fa7148f: Execute immutable schema validation plans with defaults, shared operation clocks, scalar constraints, and path-aware errors.
- 1f7b08a: Make `UltimaBase` the sole public application owner, move compilation and
  setup-only initialization onto it, and remove the parallel application and
  Runtime-engine construction APIs.
- 198ee97: Add isolated owner-scoped setup registries for services and plugin
  contributions.
- 1e28819: Authenticate field definitions, align object defaults with create-input
  presence, harden index and plugin option boundaries, and rename plugin scalar
  normalization to the explicit `snapshotValue` contract.
- e46bcce: Run every root mutation through the adapter transaction lifecycle while reusing
  existing explicit transaction scopes.
- b9d2bb9: Enforce persisted object ACLs through native Access constraints, master-only ACL
  management, request-local principal and role resolution, and locked singular
  update input resolution without exposing ACL policy to Core Runtime.
- 396e4f4: Execute owner-bound plugin operations through application handles and expose
  explicit wire bindings with safe plugin errors and fake-transport testing.
- d883791: Add portable developer UUID fields with version constraints, defaults, lists,
  indexes, operation inference, and compiled validation plans.
- 9f70dbf: Compile stable PostgreSQL selections, ordering, offsets, and cursor predicates,
  and allow Query builders to explicitly select their first cursor page.
- 61def14: Add neutral immutable helpers for explicit all-operation and mutation-only
  Access declarations.
- 07f07ef: Execute typed schema and field transaction finalization hooks with immutable commit summaries, ordered post-commit delivery, and confirmed rollback metadata.
- aebad56: Add immutable draft and persisted model commands with selection-safe protected
  PostgreSQL object identity, refresh and existence reads, and local pointer
  identity helpers.
- 8505935: Add immutable typed schema and field extensions with duplicate detection, and allow shared immutable records to accept typed configuration objects.
- 6aa2103: Add an optional provider-neutral current-principal service and validate exact
  Core Pointer ownership before Access policies consume it.
- a6c75bb: Add immutable transport-neutral Query AST contracts and typed initial
  construction from exact schema definitions.
- f9b3922: Add native binary fields with defensive byte copies, typed length constraints,
  inference, and validation plans.
- e840865: Add immutable, precisely inferred string field metadata with nested declarative validation and field extension options.

  Group field validation metadata and combine regular and unique indexing under `indexed`.

  Preserve tuple shapes when creating immutable arrays.

- 692ac5a: Add exact decimal string fields with precision, scale, ranges, inference, and
  validation plans.
- 815b791: Add plugin-defined logical fields with opaque validation plans and introduce the
  typed pg-vector field plugin contract.
- 6dca6fc: Add exact pointer Query predicates, `Pointer.query()`, and immutable
  selection-aware pointer inclusion contracts.
- 9b9c9db: Add typed `some`, `none`, and `every` relation predicates with monotonic target
  Access and correlated parameterized PostgreSQL compilation.
- 33d464d: Generate collision-resistant UUID v7 system identifiers before database insertion with deterministic test injection.
- cc12678: Add immutable number fields with explicit integer and float modes, integer-only auto-increment metadata, declarative ranges, finite constraints, and precise literal inference.

### Patch Changes

- f4baae2: Reject schema-model capability names in exact `Schema.define()` field maps and
  align developer and extension field collision types with the runtime boundary.
- 76b676e: Restore complete editor autocomplete for every built-in field factory while
  preserving exact option inference and invalid-option diagnostics. Document every
  factory and suggested option in completion details and inserted-property hovers
  with focused examples. Simplify generated declarations around named option
  interfaces and verify documentation through the compiled package export.
- 13b797f: Separate schema-model contracts, lifecycle state, command delegation, class
  composition, and Runtime materialization without changing the immutable model
  API.
- 716634d: Add transaction-bound prepared mutation outcomes with complete private field materializations and singular PostgreSQL target locking.
- 206bec5: Materialize inferred operation shapes so editor hovers display concrete schema
  properties instead of internal mapped-type intersections.
- 0977e8d: Remove unreachable internal Query mutation execution helpers while retaining
  the itemized schema-command execution path.
- 760353e: Report invalid field-option combinations on their option contracts instead of
  using misleading synthetic rest-argument arity failures.
- 9af9e98: Include extension-owned field indexes in normalized schema metadata so concrete
  adapters can create their required physical indexes.
- 2642045: Separate policy-neutral contribution, operation, relation, and result
  enforcement while retaining the existing Runtime stage contract.
- 9ca5850: Separate Query authoring, protected scopes, and operation execution behind the
  existing public QueryBuilder contract.
- aa06563: Make private-storage adapter requests an exact discriminated union and document
  the closed addressable-record boundary.
- 206bec5: Materialize selected query results so editor hovers display only projected
  fields instead of the complete schema object behind a `Pick` helper.
- 1ff75ac: Keep relation handles out of Access-narrowed row projections, make policy-owned
  master bypass explicit, and preserve standalone role notifications plus
  recursion-free ACL-protected role schemas.
- 829cf82: Centralize guarded Query-expression traversal across native Access,
  policy-neutral Enforcement, and relation-predicate collection without changing
  the public Query AST.
- 1cb87a3: Separate Runtime pipeline stage inputs, prepared database execution, and
  relationship projection while preserving the public pipeline contract and
  mandatory execution order.
- e133642: Reject unknown built-in field option and validation keys at runtime with the
  exact field kind and option path while preserving plugin-owned metadata.
- 76cf66b: Separate native Access rule evaluation, field transitions, item checks, and
  output restrictions without changing public declarations or enforcement
  semantics.
- 206bec5: Require executable bound query engines, simplify every terminal hover, compact selection inference, and materialize update and upsert inputs.
- Updated dependencies [d3e1a24]
- Updated dependencies [e4f93e3]
- Updated dependencies [8505935]
- Updated dependencies [e840865]
  - @ultimabase/shared@1.0.0
