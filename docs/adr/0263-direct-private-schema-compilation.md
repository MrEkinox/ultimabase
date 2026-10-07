# ADR-0263: Direct private schema compilation

- Status: accepted
- Date: 2026-09-21
- Decision issue: [3105](../../issues/3100-residual-complexity-simplification/3105-decide-direct-internal-schema-compilation.md)
- Implementation: [3106](../../issues/3100-residual-complexity-simplification/3106-simplify-canonical-schema-compilation.md)
- Partially supersedes: ADR-0196's internal IR requirement retained by ADR-0259
- Approval: user explicitly accepted the concrete 3105 proposal on 2026-09-21

## Proven need

ADR-0259 removed public compiler substitution. Core nevertheless converts its
validated declarations to a callback-free intermediate representation (IR),
compiles that representation, checks it and reconstructs the original domain
objects. The reference/session transport was designed for the removed compiler
boundary. Compilation, validation and immutable publication are still used.

The 21 production files / 3,648 baseline lines in the IR directory include
necessary rules. They are not a removal estimate. No speedup is promised.

## Previous flow and ownership

1. The declaration host checks privileges and captures owner-scoped schema,
   option, selection, additive patch and surface declarations. Plugin-owned
   callbacks remain within their existing authoring/runtime contracts.
2. `SchemaDeclarationRegistry.compileSchemaRegistry` stages all schema identities,
   including plugin additions, to resolve forward and circular relationships.
   `compileSchemaDeclarations` resolves contextual options with its existing
   field/context/owner cache and attaches initial provenance.
3. `encodeSchemaCompilerInput` snapshots portable values and replaces nominal
   schemas, fields, outputs, virtual fields, constraints, option definitions and
   nonportable option values with session-owned artifact references. The encoder
   adds identity reuse and deterministic IDs; the session owns reference/value
   and ID/reference Maps, plus nominal reference branding.
4. The canonical compiler starts with developer schemas. For each ordered plugin
   batch it freezes every declared selection before that batch's additions and
   patches, then applies the five additive operation kinds. Future plugin
   additions are staged for references but are not prematurely selector-visible.
5. `assertSchemaCompilerOutput` checks the complete graph and references against
   the input, provenance, Core/virtual fields and complete selection results.
   The decoder resolves artifacts, checks brands/kinds and reconstructs immutable
   `PreparedSchemaCompilation` objects, preserving unchanged field identities.
6. `compileCommandGraph` consumes selection results and final schema field facts
   to check owner-bound targets, aliases, reserved names and mutation selections.
   Registry publication validates embedded fields, exact identities/order,
   relationships and every schema before finalization. Commands become readable
   only after publication. Runtime option compilation still happens later, after
   capabilities exist and before setup, with its existing failure state.

Concrete sources: [orchestration](../../packages/core/src/plugins/compiled-schema-declarations.ts),
[registry](../../packages/core/src/plugins/schema-declaration-registry.ts),
the former `schema-compiler-ir/contracts.ts`, `canonical-compiler.ts` and
`validation.ts` under Core plugins at commit `5bc6c90b`,
[publication](../../packages/core/src/schema/schema/registry.ts).

## Decision

Keep the existing declaration capture, prepared schema representation, option
normalization and publication boundary. One private canonical compiler operates
directly on immutable prepared candidates plus owned normalized additive
operations. Reuse existing domain types and normalizers; introduce only the
small private result shape needed by the two real callers:

```text
captured owner-scoped declarations + staged prepared schemas
  -> normalize once, snapshot values, attach exact provenance
  -> freeze selections per batch, apply additive operations to private candidates
  -> validate complete candidates, ownership and selection results
  -> compile the existing command graph from candidates + selection results
  -> validate all relationships/schemas, then publish atomically
```

The compiler returns prepared candidates, immutable selection IDs/class-name
lists, provenance and existing pending runtime-option work. Command compilation
reads final persisted/virtual field facts from those candidates rather than IR
nodes. Selection facts remain inert and private; they are not another registry
or public graph. Mutable Maps may be local implementation details but must not
escape as mutable application state.

Preserve precise nominal references directly inside Core. No callback is invoked
by selection matching or patch application; existing normalization callbacks
run at their existing point, once per existing cache key. Preserve snapshots of
portable values and opaque identity where applicable, rather than assuming that
removing serialization authorizes sharing arbitrary mutable objects.

Remove the now-exclusive IR protocol version, artifact branding/session lookup,
encoder/decoder node families and format-only validators in the same change.
Do not keep a second compiler, public callback, switch, compatibility transport,
replacement capability or plugin-specific bypass. This decision adds no new
plugin power and changes no dependency direction.

## Invariant migration and tests

| Current check / owner                                                                                              | Required destination and regression evidence                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Declaration host/registrars validate privileges, ownership and nominal patch tokens                                | Unchanged before compilation; declaration-host, schema-declaration-registry and additive-patch-boundaries suites retain forged/removed-power rejection.                                                                                          |
| Input encoder resolves option definitions, contexts and normalized patch values                                    | Keep this work in preparation, including stored-context restrictions, owner ambiguity, portable option-set values and normalization count; schema-option-compilation and contextual field suites.                                                |
| Artifact session proves exact input membership and decoder verifies schema/field/output/constraint brands          | Direct domain identity plus a compilation-local membership check against captured/staged inputs; reject forged, foreign and unrelated same-run objects. Preserve unchanged field identities; no public artifact registry.                        |
| Canonical compiler freezes targets before each batch                                                               | Preserve batch order, selection ID ownership/completeness and empty results for both patches and model surfaces; canonical-compiler and application-surfaces suites.                                                                             |
| Additive field/constraint/index/option handlers enforce conflicts and provenance                                   | Preserve all five operation kinds, contribution IDs, duplicate/reserved names, relation/index restrictions, field-option contexts and independent definition/value ownership; keep public error attribution/messages for reachable declarations. |
| Node/provenance validation checks complete ledgers, matching fields/options/constraints/indexes, authorized owners | Port checks to prepared candidates and provenance directly; a trusted compiler is not permission to omit final validation. Compilation-integrity and provenance corruption scenarios must remain.                                                |
| Output validation protects original Core fields and virtual fields                                                 | Compare direct identities and normalized definitions with initial prepared facts; retain virtual dependency `id`, persisted non-relation dependencies, outputs and option provenance.                                                            |
| Output validation enforces complete schemas and selections                                                         | Final private check plus existing registry identity/order check; reject partial/duplicate graphs or selections before commands/publication.                                                                                                      |
| Decoder snapshots portable data and preserves nominal opaque values                                                | Keep immutable snapshots, shape/context validation and identity behavior. No replay of normalizers, defaults, generators, resolvers or validators.                                                                                               |
| Registry validates embedded fields and relationships before finalization                                           | Keep `publishSchemaRegistryCompilation` and all-before-finalize validation, including forward/circular references and failure before infrastructure effects.                                                                                     |
| Command graph validates selection targets, owner, aliases and mutation field selections                            | Migrate only its input types/readers to final candidate maps and inert selection results. One canonical command graph remains, per ADR-0261.                                                                                                     |
| Runtime option compilers execute after capabilities, before setup                                                  | Preserve scheduling, exact context, failure attribution and single-execution state; unchanged downstream phase.                                                                                                                                  |
| Callback-free public Typegen/transport views                                                                       | Keep ADR-0262 projections, generated declarations/fingerprints and narrow request capability. Private direct references never become public compiler inspection data.                                                                            |

Transport-format tests that only forge obsolete artifact envelopes or change the
removed private protocol version may disappear with that format. Their live
identity, membership, immutability, provenance and completeness scenarios must
move to the direct boundary. Do not delete a security assertion simply because
its old fixture used IR. Compare retained coverage locations and explain every
removed instrumented body; never relax thresholds or exclusions.

## Consumers and observable differences

Only `compiled-schema-declarations.ts` and `application-surface-registry.ts`
import this IR outside its own directory in production. GraphQL's similarly
named schema compilers are separate consumers of existing public schema facts,
not this IR. The registry call site adapts to the private result shape.

Typegen keeps the current `CompiledTypegenGraph` projection; REST, GraphQL,
application handles, model commands, database adapters and concrete option
providers keep their existing contracts. Their tests and generated artifacts
must demonstrate parity rather than relying on the absence of direct imports.
No exported name or public compiler API changes are authorized.

The user also explicitly approved removal of one incidental selector behavior. The current encoder
replaces a callback-containing option object with a private marker. A public
selector can accidentally match `option.path: ['artifactKind']` with
`equals: 'option-value'` against that marker, even though this property does not
belong to the declared option. A built-package experiment on 2026-09-21 confirms:

```text
opaque = { enabled: true, callback: () => undefined }
selector path ['artifactKind'], equals 'option-value' -> matches
selector path ['enabled'], equals true               -> does not match
```

The public path contract promises paths into normalized portable option values,
not marker inspection. No repository consumer of this accidental marker lookup
was found. Accepted explicit delta: nonportable values still support presence
and absence, but equality/path selection cannot inspect either the opaque value
or removed marker metadata (`kind`, `artifactKind`, `artifactId`). Portable
values retain structural matching, even when their option definition declares
`valueKind: 'opaque'`. Do not instead traverse callbacks/opaque object contents.
Add a regression using the public declaration path and review the plugin-authoring
website explanation in 3106. Existing tests that inspect private IR via spies
must assert non-execution and public projection safety instead.

Errors about malformed private IR envelopes/versions disappear with that private
format. Reachable public declaration errors, their owner attribution, compile
ordering and setup prevention remain acceptance requirements. Any other public
difference found during implementation requires another stop.

## Delivery and approval boundary

The user replied "validé" to the final concrete proposal on 2026-09-21,
authorizing direct private compilation, retained final checks and removal of
incidental opaque-marker selector matching. This supersedes only the residual
internal compiler transport requirement of ADR-0196/ADR-0259. Their historical
text stays intact; plugin isolation, provenance and inert public views remain.

Issue 3106 updates Core documentation/schema examples and affected
website pages, runs full source/type/security/coverage and built/packed/PostgreSQL
checks, compares exports, generated types/fingerprints and measurements, and
repeats the complete audit until clear. Actual reductions are reported afterward.
If preservation cannot be demonstrated, stop; retaining the current compiler is
preferable to an unchecked path. The accepted scope does not authorize an unchecked replacement if a preservation
problem is found.

A separate Core path-resolver orphan found in 3104 is recorded in the inventory.
It is not part of this compiler design. The same user approval authorizes its
bounded cleanup in a separate 3102 follow-up commit, after 3105 and before 3106.
Keep the used public path types, and record validation and exact line counts.

Implementation source mapping: [direct compiler](../../packages/core/src/plugins/schema-compilation/compiler.ts),
[private preparation](../../packages/core/src/plugins/schema-compilation/preparation.ts),
[final validation](../../packages/core/src/plugins/schema-compilation/validation.ts).
These links update the implementation evidence without changing the accepted
preservation requirements or historical decision.
