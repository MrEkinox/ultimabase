# 6305: Project plugin authoring types from source

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, plugin authoring contracts
- Depends on: 6304
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Let one static plugin definition project its exact fields, options, operations,
schema mutations, and model surfaces into `App.Schema` without generated
plugin-surface output or a second author-maintained registry. The retained
Typegen graph remains responsible only for named cross-schema resolution.

## Starting inventory

- Starting revision: `bfa25405`.
- `FrameworkPlugin` retained exact identity, exports, dependencies, privileges,
  and capability contracts, but carried no source-authoring projection.
- Field families, schema and field options, plugin-owned schemas, model
  surfaces, and operation tokens were already declared once through nominal
  Core contribution values; their registrar calls returned `void`, erasing the
  exact declaration types before `.use()` could compose them.
- Configured factories retained the exact plugin tuple but exposed one
  non-generic `ConfiguredSchemaNamespace`; plugin builders, options, mutations,
  commands, and operations therefore still depended on generated ambient
  declarations.
- Plugin Kit delegates these foundational declarations to Core and needs no
  parallel registry. Existing official plugin migration remains assigned to
  issues 6307-6311.

## Acceptance criteria

- [x] Core exposes one plugin-neutral source-type projection contract carried by static plugin definitions.
- [x] Core does not import Plugin Kit or a concrete plugin; Plugin Kit remains optional convenience over the same native boundary.
- [x] One plugin declaration is the source for Runtime ownership/provenance and TypeScript authoring; authors do not repeat names or shapes in a separate Typegen descriptor, while the central generator may consume the compiled schema graph for cross-schema names.
- [x] Root, embedded, virtual, and output field families; field and schema options; application operations; schema mutations; model commands; and plugin-owned schemas retain their current supported distinctions.
- [x] Installed plugins add exact surfaces to only their configured application; absent plugins add nothing.
- [x] Multiple explicit instances remain legal and ambiguous local configuration fails deterministically.
- [x] Option and method conflicts, reserved names, missing privileges, unsupported targets, and incompatible requirements retain focused diagnostics.
- [x] Direct schema options configure installed plugins but never install or order them.
- [x] No `Schema.use()`, ambient application augmentation, plugin map, nested plugin, or automatic registration is introduced.
- [x] Public plugin-author documentation and conformance helpers are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Core-native and Plugin Kit community-plugin conformance fixtures.
- [x] Exact option, field, command, instance, and absence editor contracts.
- [x] Runtime provenance, privilege, order, collision, and cleanup regressions.
- [x] Source and packed-package language-service tests.
- [x] Locked TypeScript performance and memory budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and map every retained plugin contribution/type descriptor and current official/community consumer before replacement.
- [x] Audit the complete diff for duplicated Runtime/type declarations, Core-to-plugin dependency reversal, ambient leakage, instance ambiguity, lost provenance/privilege checks, speculative generic machinery, stale Typegen paths, and editor/performance regressions.
- [x] Record each finding and correction in the handoff; rerun affected conformance, editor, budget, and complete audits until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; no fallback registry, cast, deep import, or plugin-specific exception may bypass the failure.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Implementation evidence

- Every authorized field-family, direct-option, additive-field,
  schema-mutation surface, model command, and application-operation registrar
  returns one Runtime-inert nominal receipt. `contributeDeclarations()` derives
  the source projection from those same calls; plugin authors maintain no
  second descriptor or registry.
- `plugin()` carries that exact projection through its existing static
  definition. Immutable `UltimaBase.use()` composition intersects contextual
  builders and operations and preserves selector-scoped schema projections.
  No plugin declaration runs before the existing privilege gate.
- `App.Schema.define()` resolves installed root, embedded, virtual, and output
  field builders, exact field and schema options, additive fields, schema/model
  mutation methods, and selector predicates from the configured source state.
  `UltimaBase.Schema` remains the zero-plugin form and explicit `schemas` stays
  the only Runtime registration root.
- Pointer and relation names still resolve through the retained generated name
  graph. The configured-only relation contract keeps plugin field options out
  of the canonical Typegen relation method, so source projection does not
  replace or duplicate cross-schema resolution.
- Source and packed language-service fixtures verify installed/absent builder
  completion, exact field-value hover, and application-operation results
  without generated plugin declarations. Plugin Kit consumes the same Core
  boundary and owns no projection registry.
- The locked 1/10/50-schema checkpoint, raw samples, comparison against the
  current generated form, and evolution from issue 6304 are recorded in
  [`evidence/6305-plugin-source-benchmark.md`](evidence/6305-plugin-source-benchmark.md).

## Audit findings and corrections

| Finding                                                                                                                                                | Correction                                                                                                                                                                  | Proof                                                                                                                                               |
| :----------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| The first option projection widened the canonical built-in factories and lost their named invalid-option diagnostics.                                  | Parameterized the existing factory contracts directly, preserving their overloads and diagnostic aliases instead of wrapping them in a broad callable facade.               | Field-option diagnostic, Core type, and source/packed language-service suites pass.                                                                 |
| Applying the configured relation option type to the canonical named relation method changed retained Typegen relationship contracts.                   | Kept `NamedRelationFieldBuilderMethod` unchanged and introduced one configured-only source variant at the `App.Schema` boundary.                                            | Existing schema declarations and the new pointer/relation source-option assertions pass together.                                                   |
| The initial callback-result constraint accepted arbitrary objects at type level, and its first correction still allowed `undefined \| invalid object`. | Accept only no-return callbacks, nominal receipts, or recursive receipt arrays; reject every unsupported union statically and retain the Runtime boundary for untyped code. | Negative type regressions cover direct and conditional invalid returns; Runtime rejects a forged object result.                                     |
| The first selector projection handled option presence but not nested `path` equality or exact field kind.                                              | Added type-level path lookup and source field-kind metadata while reusing the existing selector vocabulary.                                                                 | Positive and negative option-path and field-kind selector contracts pass.                                                                           |
| A `models.extend()` call without mutations could infer the registrar's broad mutation-map constraint.                                                  | Defaulted the exact mutation map to an empty record, so a metadata-only call projects no phantom command.                                                                   | Core typecheck and the complete source-projection type fixture pass.                                                                                |
| Field and output adapters independently repeated contextual surface lookup and callable option composition.                                            | Centralized those two invariants in the plugin-neutral source projection module; retained only value extraction specific to each builder family.                            | Both adapters are below 80 lines and root/embedded/virtual/output tests remain exact.                                                               |
| Two cold benchmark samples let one host-load spike distort the mathematical median and fail complete coverage despite an immediate isolated pass.      | Increased the locked run to three independent cold processes without changing any threshold; the median now rejects one outlier.                                            | Two consecutive isolated runs pass; the durable three-sample checkpoint retains every compiler, editor, memory, declaration, and generation budget. |
| The first public export pass exposed internal projection/state inspection types that application and plugin authors do not need.                       | Kept only the field-value placeholder required to type value-dependent plugin options; internal aggregation and selector machinery remain package-private.                  | The Core package builds with 1,097 public exports, ATTW and publint both pass.                                                                      |

## Current validation evidence

- Focused Core and Plugin Kit type suites: 3 files, 8 tests, zero type
  errors; the final source-projection fixture also covers two explicit plugin
  instances with distinct exact operations.
- Focused Runtime and source/packed editor suites: 3 files, 18 tests passed.
- `@ultimabase/core` typecheck and package build pass; the built declaration is
  653,368 bytes, ATTW reports no problem, and publint reports no issue.
- Locked three-sample performance benchmark: passed twice. At 50 schemas the
  hybrid target is 54.8% faster for cold checking, 69.7% faster after an edit,
  78.3% smaller in generated declarations, and 61.0% lower in peak TypeScript
  heap; generation is 7.4% slower and remains within budget.
- Complete issue diff at handoff: 60 files, +3,057/-483 lines;
  production +1,967/-336, tests +803/-39, documentation and issue evidence
  +287/-108. The production increase is the shared Core projection foundation;
  issues 6307-6313 consume it and remove the corresponding per-plugin Typegen
  copies before the milestone's required net-reduction audit.
- `yarn validate:full`: passed from formatting through public documentation.
  Ordinary validation passed 555 files and 2,619 tests. Complete coverage passed
  633 files and 2,876 tests with zero type errors: 90.92% statements
  (`23,741/26,110`), 84.49% branches (`14,697/17,394`), 96.08% functions
  (`5,007/5,211`), and 91.48% lines (`23,029/25,172`). Issue metadata passed
  9 tests, public documentation passed 17 files and 66 tests, and dependency
  constraints completed successfully.

Documentation impact: **both** — the plugin-author contract and Typegen
boundary changed, so Core and Plugin Kit engineering READMEs, the open-plugin
concept, and the owned public website guide were reviewed and updated together.

## Out of scope

- Special treatment for official plugin package identities.
- Redesigning or removing the retained cross-schema Typegen graph.
- A general higher-kinded-type API exposed to application developers.
