# 3011: Derive developer and Typegen surfaces

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, official command-owning plugins
- Depends on: 3010
- ADR: ADR-0259, ADR-0261 and explicitly approved ADR-0262

## Goal

Derive schema classes, application handles, model handles, JavaScript lookup,
and Typegen declarations from the canonical command graph rather than parallel
surface registries.

## Acceptance criteria

- [x] One surface projection derives command presence, target, authority,
      payload, selection, inclusion, and result types for every retained direct
      TypeScript entry point.
- [x] Static class execution follows the single-active-application contract;
      application and model handles remain thin immutable views rather than
      owners of separate command metadata.
- [x] Generic Typegen derives application-operation and schema-mutation declarations from the
      same graph used by JavaScript Runtime execution.
- [x] Source and packed autocomplete, hovers, required fields, negative cases,
      application-specific commands, and no-Typegen JavaScript retain current
      behavior.
- [x] No command owner repeats a Typegen surface declaration that the graph can
      derive, and no generated artifact becomes Runtime truth.
- [x] Superseded surface registries and generators are removed in the same
      change whenever their final consumer migrates.

## Tests

- [x] Core, Typegen, Password Auth, Soft Delete, source editor, packed editor,
      JavaScript, first-generation, stale-output, fingerprint, and performance
      suites pass.
- [x] Public export, typecheck, lint, build, constraints, `attw`, and `publint`
      checks pass where affected.

## Audit gate

- [x] Audit every direct command surface against the canonical graph and search
      for duplicated declarations, generated Runtime state, lost inference, and
      stale registries. Correct and repeat until green.
- [x] Record editor, build, line, file, test, duration, and Documentation impact
      evidence before completion.

## Out of scope

- REST or GraphQL transport projection and new generated client behavior.

## Approved refinement: Typegen inspection contract

The dependency is complete in `394045ab`. A read-only audit found a public
contract boundary before implementation:

- `packages/core/src/plugins/typegen-declarations.ts` exports
  `CompiledTypegenGraph`, also exported at the Core package root and exposed by
  `FrameworkApplication.typegenGraph` and `PluginSetupContext.typegenGraph`.
- Its operation entries expose the original nominal operation definition,
  including `input.snapshot` and `result.snapshot` callbacks. Its schema surface
  entries expose the original `SchemaDefinition` constructor.
- `packages/typegen/src/snapshot/plugin-graph.ts` consumes operation metadata,
  nominal type references, owners and schema/mutation descriptions; it never
  invokes these callbacks or constructs a schema. It only reads
  `surface.schema.className` from the schema constructor.
- `packages/testing/src/plugins/static-snapshot.ts` likewise consumes descriptive
  facts, and the no-Typegen JavaScript fixture only reads operation names. The
  repository search found no consumer of the executable members through this
  inspection contract. This does not establish compatibility for external tools
  using the exported type.

ADR-0259 calls for callback-free projections without constructors, but its ten
exact public removals do not explicitly include narrowing this tooling input.
Keeping the current shape requires retaining executable source tokens in the
Typegen view; replacing them silently would change observable public behavior.
The plan's architecture stop gate applies before either choice is implemented.

The user explicitly approved the proposed narrowing in ADR-0262. Keep
`CompiledTypegenGraph` and its property layout; derive operation entries from
canonical inert facts without snapshot callbacks or nominal executable-token
identity, and replace each surface's schema constructor with `{ className }`.
Keep consumed nominal type references, ownership, mutation metadata and ordering.
No additional graph API, registration API or compatibility path is introduced.

Direct methods, original operation declarations, Runtime validation, generated
types and fingerprints retain their behavior. This resolves the recorded stop;
implementation and its audit must complete before issue 3012.

Documentation impact: both.

## Implementation and audit

Typegen reads operation facts directly from the canonical command records and
schema/model aliases from the same compiled index used by direct handles. The
old `legacyViews()` bridge and its intermediate operation/schema Maps are
removed, together with the unused provenance argument. The public inspection
shape is narrowed exactly as approved; retained nominal type references are not
replaced with strings or structurally reconstructed tokens.

The direct-surface audit follows static class dispatch through the active
application's `getSchemaSurface`, application and model handles through the same
aliases, and operation handles through their exact canonical command. Existing
caches store dispatchers or immutable views, not independent declarations.
Typegen's renderer derives class/schema/model signatures from those aliases;
Password Auth and Soft Delete already register consumed nominal references and
need no duplicated Typegen declaration or production change. No schema-domain
implementation or schema example changes are necessary.

Regressions protect inert operation descriptions and schema identities, unchanged
alias order and private Master metadata, exact canonical fact sharing, detached
inspection Maps, source/built negative type checks, and JavaScript execution
without Typegen. The generated declaration, snapshot and fingerprint for a
fixture containing both retained command kinds are byte-identical before and
after this change (8,527-byte JSON comparison).

No new public API, capability, compatibility accessor, registry or generated
Runtime dependency is introduced. The only accepted scope refinement is
ADR-0262's explicit tooling-contract narrowing. Core/Typegen READMEs and the
website's plugin-authoring Typegen page document it in this same issue.

## Validation evidence

Final audit: no unresolved finding. The approved inspection change is complete;
all direct and generated consumer contracts remain covered. No additional
architectural change or plugin implementation was needed.

- `yarn typecheck`: passed.
- `yarn build`: passed in 38.800 seconds, including `attw` and `publint`.
- `yarn test --maxWorkers=2`: 534 files / 2,534 tests passed, zero type
  errors, 206.84 seconds. This includes source editor, first generation, stale
  output, deterministic fingerprints, Password Auth and Soft Delete suites.
- `yarn test:e2e:built --maxWorkers=2`: 97 files / 381 tests passed in
  160.85 seconds, including built editor/type exports, no-Typegen JavaScript,
  transports and PostgreSQL behavior.
- `yarn website:validate`: 17 files / 66 tests passed.
- Full lint, constraints, issue metadata, formatting and diff checks passed.
  Existing file-size warnings remain; no limit or baseline was increased.
- The pre/post built-export Typegen probe is byte-identical, including generated
  contents, snapshot and fingerprint. No snapshot/generator format bump.
- Complete coverage and the website production build were not rerun. Coverage
  configuration, exclusions, thresholds and CI selection remain unchanged.

Production TypeScript is 703 files / 127,998 lines, including Core's 338 files /
68,825 lines: **-1 production line**, no file-count change. Tests/support are
708 files / 130,569 lines: **+88 lines**, no file-count change. Public exports
remain **1,726**; declaration size is **858,980 bytes**, +636 bytes for the
explicit descriptive tooling types. Full commit counts include documentation
and the JavaScript regression, and are reported after the dedicated commit.

A quiet 20-lifetime no-product sample reports median startup/read/mutation
**1.662 / 0.413 / 0.511 ms** and heap medians **8,968,912 / 9,994,544 /
10,191,216 bytes**. This fixture executes no plugin command and establishes no
speedup. Concurrent local test durations are not CI estimates. Measurements
identify the preceding HEAD plus the issue's working tree.
