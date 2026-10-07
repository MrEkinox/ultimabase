# 6703: Simplify relation construction, ordering and field traversal

- Status: completed
- Milestone: 67
- Packages: core
- Depends on: 6702
- ADR: 0004, 0005, 0132, 0162, 0243, 0275

## Goal

Test the four user-approved internal simplifications. Retain only a smaller,
clearer implementation with identical capabilities, diagnostics and public DX.

## Working context

- Scope: neutral query construction for relation mutations, nested-write declaration indexes, ordering deduplication, and update-field collection/dead branches. No public API, dependency, executor or Typegen change.
- Current contracts: Core README and schema/query/runtime guides; ADR-0004/0132 execution, ADR-0005 immutability, ADR-0162 protected identities, ADR-0243 deterministic bounded nested writes, ADR-0275 validation; relation, nested-write, ordering and field-input tests.
- Locked decisions: preserve private source/target/ownership filters, hidden-target errors, transaction and Runtime order, declaration indexes including omitted fields, first ordering position/last direction, validation of every duplicate and immutable snapshots.
- Rejected approaches: none. Do not reopen retained Typegen/hover limitations, remove structural guards or create a replacement abstraction.
- Proof commands: focused unit and type suites, root typecheck, permissioned yarn validate:full and yarn test:e2e:built; compare coverage and compiled Core declarations with the verified previous artifact.
- Exploration budget: two comparable failures or 30 minutes without verifiable progress per trial, excluding validation waits. Stop before expanding architecture; roll back only rejected experiments.
- Next action: none. Full/compiled validation and final audit passed. No push authorized.

## Documentation impact

Internal engineering documentation. Review Core contracts, schema examples and
website ownership/pages. No public edit is expected because authoring, behavior,
diagnostics and execution remain unchanged; record the final review below.

Core Query guide now names the internal relation mutation path. Core README,
schema/runtime guides, relation/nested-write examples and website ownership plus
Relationships, Nested Writes and Ordering/Pagination were reviewed. The Schema
guide's stale pointer-input prose is corrected to the ID-based contract already
accepted in ADR-0243 and documented on the website. No public behavior, website
edit or new architecture decision is needed.

## Trial evidence

- Baseline: clean main at 7de2aff9, eight local commits ahead; remote main remains
  8177161f. No push authorized. The previous verified coverage/declaration
  artifacts are saved in /private/tmp/ultimabase-core-traversal.C6WyOg/; this is
  not a fresh second baseline validation run.
- Five focused suites with the new parity tests pass on the old implementation:
  32 tests. The checks cover neutral AST parity, private identity/membership and
  disconnect ownership, omitted-field declaration indexes, overwritten invalid
  directions, and malformed update values.
- Relations: three Runtime helpers use existing createQueryAst directly; the
  source handle reuses existing normalized find-one input and private scope.
  Four internal QueryBuilder construction sites are removed, without a facade.
- Nested writes: the existing field-entry iterator supplies the declaration
  index directly, including omitted fields; no repeated findIndex remains.
- Ordering: one Map retains first priority and latest direction. Every entry
  still validates before replacement; immutable snapshots/empty sharing remain.
- Field traversal: one Set retains first affected-field order. A private reader
  returns a value or throws, so its impossible undefined branch is removed.
- After changes: eight focused unit suites / 52 tests passed; three type suites
  / five tests passed without type errors; root yarn typecheck passed. Focused
  ESLint has no errors; four pre-existing production size warnings remain.
- No rejected trial or new abstraction remains. No Runtime speedup is claimed.

## Validation checkpoint

- Permissioned yarn validate:full and yarn test:e2e:built both passed, exit 0,
  in sequence. Formatting, root typecheck, 561 files / 2713 unit/type/performance
  tests, sequential lint/build, 640 files / 2977 source/PostgreSQL coverage tests,
  22 issue checks, dependency constraints and 66 website documentation tests
  passed. Compiled archives, editor/types, listeners and PostgreSQL consumers:
  102 files / 410 tests passed. No required failed, skipped, flaky, interrupted
  or unavailable check remains.
- Existing size warnings remain: 53 Core, 29 other packages and one workspace;
  no exception, threshold, exclusion or worker limit changed.
- Same 731 covered files before/after, no file lost and no regressed unchanged
  file in the JSON comparison. Statements 23771/26057 (91.22%) to 23772/26047
  (91.26%); branches 14704/17356 (84.71%) to 14705/17350 (84.75%); functions
  5010/5189 (96.55%) to 5011/5188 (96.58%); lines 23047/25111 (91.78%) to
  23049/25102 (91.82%). Every percentage improves and uncovered counts fall.
- Built Core index.d.ts is byte-identical to the baseline, SHA-256
  37533f47cef296840a88e65b3626c9a24259be2187b931ec88aa2daa171a59f7.
- Logs, baseline artifacts and coverage comparison script are saved under
  /private/tmp/ultimabase-core-traversal.C6WyOg/.

## Acceptance criteria

- [x] Prove or reject direct neutral relation query construction without changing protected execution.
- [x] Preserve nested-write declaration indexes and effect order without repeated index lookup.
- [x] Preserve ordering priority, replacement, duplicate validation and immutability using one Map.
- [x] Preserve update-field validation/order and remove only demonstrably unreachable branches.
- [x] Record net production/test/documentation lines, coverage and compiled declaration parity.
- [x] Audit the full diff, fix findings, pass full/compiled validation and inspect a dedicated local commit.

## Final audit

- All four trials retained. Exact public types/exports, immutable ASTs/builders,
  private identities and ownership, protected target visibility, errors, nested
  declaration/command order, transaction and Runtime stages remain intact.
  Typegen is unchanged; no new dependency or public capability exists.
- Production: +20 / -32 = -12; relations -1, nested indexes -1, ordering -4,
  update traversal -6. Core: 372 production files, 70108 to 70096 lines.
  Tests: +204 / -0 = +204, eleven new cases plus stronger existing assertions.
  Documentation: +125 / -14 = +111, including checkpoint, issue and guides.
  Whole diff: +349 / -46 = +303; the increase is tests and documentation.
- Assessment: modest line reduction, four fewer internal builder construction
  sites, no repeated nested index lookup, one mutable ordering collection instead
  of two, no linear field deduplication search or unreachable value-reader branch.
  Public DX is preserved, not expanded; no performance measurement is claimed.
- The audit found stale pointer-input prose in the internal Schema guide; it is
  corrected to the already accepted ID contract. No unresolved finding remains.
