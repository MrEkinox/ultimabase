# 3106: Simplify canonical schema compilation

- Status: completed
- Milestone: 31
- Packages: @ultimabase/core; real downstream consumers only where required by 3105
- Depends on: 3105
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Implement only the accepted 3105 design and remove the superseded compiler plumbing in the same bounded change.

## Acceptance criteria

- [x] Start only after the exact 3105 design is accepted. Replace the approved round trip with the smallest direct internal compilation path; do not retain a second live compiler, runtime switch or compatibility registry.
- [x] Preserve contribution ownership, nominal field identity, normalized options, selector target freezing/order, duplicate rejection, Core system fields, relationship integrity and atomic publication before infrastructure effects.
- [x] Provide existing command/surface consumers their required facts without making executable declarations public or changing the canonical graph's ownership.
- [x] Remove obsolete IR/session/encoder/decoder contracts and validation branches only as authorized, after mapping every retained invariant to its final check and regression test.
- [x] Verify plugin schemas, contextual fields, additive Soft Delete patches, Access/Hooks/Validation options, operations, mutations, Typegen output and both transports preserve behavior and errors.
- [x] Review/update schema examples, authoritative engineering docs and any affected public website pages in this issue. Stop for any public difference outside the accepted decision.
- [x] Record final representations, registries, source lines and measured compile/startup behavior; a smaller file count alone is not success.

## Tests

- [x] Run full source/type/security/conformance and coverage validation; compare retained locations and generated declarations/fingerprints against the baseline.
- [x] Run full built/packed/PostgreSQL validation, representative direct/REST/GraphQL flows, constraints and affected website checks, alongside all implementation gates.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Unapproved plugin/kernel API changes, new generic compiler extensibility or unchecked trusted-input shortcuts.

## Handoff

Documentation impact: both. Core's README, architecture, schema examples and
plugin-authoring website now describe the direct private compiler and the
accepted opaque-selector boundary. Public exports and callable signatures are
unchanged; the valueKind hover documentation no longer mentions a removed IR.

The final path is captured/staged declarations -> normalized immutable prepared
candidates -> ordered additive patches and frozen selections -> mandatory final
validation -> existing command compilation -> existing atomic publication.
There is no second compiler, transport switch or replacement API. The only
approved public behavior delta is removal of opaque artifact-marker matching;
portable equality/path matching and opaque presence/absence remain.

### Invariant and test migration

- Privileges, nominal patch tokens, owner capture, contextual field normalization
  and runtime-option scheduling keep their existing hosts and suites. Both
  transports still consume the same public graph and request capability.
- The private result validator checks exact complete schema identity/order,
  frozen metadata, original Core/virtual identities and attribution, virtual order, field/constraint
  membership, complete provenance ledgers and complete selection results before
  commands/publication. The existing registry retains all-before-finalize
  embedded-field and relationship validation.
- Direct compiler tests retain normalization counts, deterministic results,
  frozen pre-batch targets, additions and all five additive patch families with
  separate definition/value ownership. Public opaque-selector tests verify the
  accepted delta, portable values under valueKind opaque, and callback silence.
- Integrity fault injection is test-private. It covers partial/duplicate graphs,
  immutable metadata, changed schema/Core/virtual identities, unrelated nominal
  and forged fields, foreign constraints/owners, incomplete provenance and
  missing/duplicate/foreign selections, terminal failure and setup prevention.
  Virtual output/dependency identity is retained without executing defaults or
  resolvers. Opaque classification is reused without reopening getters. Empty selections cannot hide nonportable declaration data.
- Former artifact-version/ID-branding/encoder-mask self-tests are removed with
  their private format, including the private artifact type test and source-text
  wiring test. Their live membership, identity, immutable graph, completeness,
  isolation, provenance and callback-silence assertions are retained on the
  direct/public path. The unchanged source/built selector and editor tests keep
  their historical filenames without importing the retired IR.

### Measurements

Against the immediately preceding 75ed6561 working tree, production is -2,256
lines. The compiler directory goes from 21 files/3,639 lines to 7 files/1,368
lines; adapting its existing consumers adds a net 15 lines. Total production is
124,178 lines and Core 66,129, down 2,915 and 2,651 respectively from 3101.
Tests/support is 130,979 lines; tooling remains 2,119. These counts use the
unchanged baseline classifier, not documentation or generated output.

The two artifact lookup Maps, global reference-brand WeakSet, encoder reverse
WeakMap/per-value Maps and ID generator are gone. Three compilation-local
membership containers (two WeakSets and an opaque-value Set) retain provenance
checks without IDs or value lookup. PreparedSchemaCompilation is the sole
schema representation; batches reuse normalized domain operations, and the
private result adds only immutable selection lists. PreparedSchemaCompilation
occurs in 11 production files (10 at baseline), SchemaCompilationResult in 5
and SchemaCompilationValues in 6. The old input/output/session names have zero
production references; this records actual change fan-out without claiming a
made-up complexity percentage. Own-name record lookups preserve list semantics for inherited names such as
constructor, toString and valueOf; nine public selector/patch/mutation tests
cover the conversion. Temporary ordering Maps
remain local and do not become public mutable application state.

All 1,726 root export names remain. Core declaration regions are byte-identical
apart from the corrected valueKind JSDoc; imports reorder bundled regions.
Hooks retains its previously accepted Core type reuse. Overall declarations are
856,670 bytes versus 858,903 at 3101 (-2,233, including Hooks -2,244 and the
Core comment +11). No Typegen artifact is manually regenerated to hide drift.

The unchanged 20-sample runtime tool reports startup 1.040358 ms, read
0.409538 ms and mutation 0.514700 ms, versus 1.693456/0.404961/0.495590 at 3101. Median heaps before/startup/requests are 9,805,256/10,323,856/10,520,560
bytes. This simple local no-product sample includes compilation in startup;
it is descriptive, not a general performance claim or regression budget.
Runtime/size tool revision fields identify parent 75ed6561 plus this uncommitted
issue diff. CI remains unmeasured; no push is authorized.

### Audit loop

| Pass | Finding / correction                                                                                                                   | Verification                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Preserve validation of unused index declarations and mandatory graph membership/completeness after removing serialization              | Empty-selection and fault-injection regressions; existing public compiler/option suites pass                                                                                          |
| 2    | Migrate virtual identity/resolver-silence assertions, avoid reopening opaque getters, preserve protected attribution and virtual order | Old encoder/decoder/node/output checks mapped to the direct boundary or existing publication checks; failed initialization never reaches setup                                        |
| 3    | Correct stale IR JSDoc, dead inventory link and milestone resume text; compare declaration regions rather than bundle order            | Root typecheck/build, 1,726 exports, callable declarations, website validation/build and focused lint pass                                                                            |
| 4    | Record lookups could accept inherited field names, and added persisted fields must remain before virtual fields                        | Own-property guards and nine public regressions; deterministic compiler test also checks publication order; existing sameOwner helper reused instead of duplicated                    |
| 5    | Full coverage passes but the path-without-equals selector branch lost an old IR-only test                                              | Scenario moved to the public declaration suite; all 47 focused cases pass; 2,795 tests / 606 files pass; zero retained-location regressions, including the moved provenance validator |
| 6    | Final built/packed/PostgreSQL and scope audit                                                                                          | 2,795 source/type/coverage and 384 built/packed/PostgreSQL tests pass; retained coverage, public declarations, documentation and scope audit are green; no remaining finding          |

Four coverage attempts were deliberately interrupted after audit findings
changed production code. One complete pre-final run passed 2,794 tests and
identified the retained selector coverage gap; its report is kept separately. Only the completed final run counts as
validation. Initial fixture typing/assertion errors were corrected before the
final root build; no thresholds, exclusions or security checks were relaxed.

Final validation evidence (local logs and snapshots: `/tmp/ultimabase-m31-3106`):

- `yarn typecheck`, `yarn build`, root `yarn lint` and `yarn constraints` pass.
  Subsequent corrections also pass focused ESLint and repository test typechecking.
  Root lint retains only the two unchanged website/browser and REST E2E size warnings.
- `yarn test` passed during implementation; the final `yarn test:coverage` includes
  all current unit/type/performance projects plus instrumented integrations:
  **2,795 tests / 606 files**, no type errors, all unchanged thresholds pass.
  Statements 90.59%, branches 84.04%, functions 95.86%, lines 91.19%.
- Coverage comparison with 3101 checks 667 identical instrumented maps plus
  1,026 mapped locations in changed files. No retained covered location is lost.
  The moved provenance validator has identical maps and no loss. Unmapped
  locations are the previously audited private dead code, obsolete IR transport,
  and replaced readers/compilation wrappers; their retained scenarios are mapped
  above, including the restored public selector rejection.
- `yarn test:e2e:built`: **384 tests / 98 files**, including packed declarations,
  generated-project/editor contracts, the committed Todo declarations and
  fingerprint, PostgreSQL, direct/REST/GraphQL, Soft Delete, Password Auth,
  Hooks/Access/Validation and optional-capability conformance.
- `yarn website:validate`: 66 checks; `yarn website:build`: pass.
  Public package declarations remain unchanged after archive validation except
  the already reviewed Core JSDoc and prior Hooks type reuse.
- Backlog/active-contract checks, changed-file formatting, relative links and
  `git diff --check` form the final documentation/commit gate.

Reviewed scope: parent `75ed6561` plus this complete issue diff. No work exceeds
3106/ADR-0263 acceptance criteria; preserving callback silence, own-name lookup,
field order and attribution are required parity corrections, not new powers.
The dedicated local commit is created after the documentation gate and reported
outside its own contents. No push. Next: prepare 3107's three explicit public
protocol decisions and stop for user direction before accepting removals.
