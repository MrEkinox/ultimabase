# 6702: Simplify model commands, inclusions and result materialization

- Status: completed
- Milestone: 67
- Packages: core
- Depends on: 6701
- ADR: 0004, 0005, 0132, 0162, 0275

## Goal

Test the three user-approved Core simplifications independently. Retain only
net simplification with identical capabilities, diagnostics and public DX.

## Working context

- Scope: persisted model command construction, inclusion deduplication/conversion, and Runtime result materialization only. No new public API, dependency, executor, Typegen or relation graph.
- Current contracts: Core README and schema/query/runtime guides; ADR-0004/0132 execution, ADR-0005 immutability, ADR-0162 strict protected identities, ADR-0275 validation; existing model, singular-terminal, inclusion and result tests.
- Locked decisions: preserve public AST filters and selections, private object identity and ownership, strict missing/hidden-target errors, Runtime stages/transactions, first inclusion position/last configuration, target validation, exact model prototypes/types and existing error precedence.
- Rejected approaches: none in this issue. Do not reopen retained Typegen/hover limitations or bypass constructor branding, structural validation or target checks.
- Proof commands: focused model/runtime/inclusion unit tests and Query/model type tests; root typecheck; rebuilt Core Query/editor and Runtime consumers; permissioned yarn validate:full and yarn test:e2e:built before completion/commit.
- Exploration budget: two comparable failures or 30 minutes without verifiable progress per trial, excluding validation waiting. Roll back only the rejected trial and stop before expanding architecture.
- Next action: none. Full/compiled validation, final documentation checks and diff audit passed. No push authorized.

## Documentation impact

Internal engineering documentation. Review Core contracts, schema examples and
website ownership/pages; explain why public documentation needs no change if
the developer contract remains identical. No new architectural decision.

Core Query guide now includes the directly normalized persisted-model path.
Reviewed Core README, schema model/examples and website ownership plus Models,
Selections, Update and Delete. Public declarations, errors, projections and
execution remain unchanged; no public website edit or new ADR is needed.

## Trial evidence

- Models: reuse the existing find-one input normalizer and private scope; remove
  two helper functions, one private facade and builder assertions. The real
  strict-target fixture compares all four public ASTs and private row filters
  with the previous builder shape; its focused regression passes.
- Inclusions: a Map replaces repeated linear duplicate searches and preserves
  first position/last shape. Fluent include passes existing nodes directly;
  every target is still checked, including invalid overwritten duplicates.
- Results: reuse existing scalar/nullable/collection classifications, one
  collection mapping and one singular materialization. Preserve error order
  for simultaneously malformed schemas and results.
- Focused checks exposed incomplete ASTs in the new result test fixtures, not
  a production typing failure. Fixtures now use complete native operation
  contracts; no existing assertion or production type is weakened.

## Validation checkpoint

- Baseline at HEAD 87b70e46: 372 Core production files / 70183 lines. The
  preceding verified coverage artifact was copied before this run: 731 files;
  statements 23782/26073 (91.21%), branches 14705/17361 (84.70%), functions
  5014/5194 (96.53%), lines 23057/25126 (91.76%). This is not a fresh second
  baseline run. Exclusions, thresholds and worker bounds are unchanged.
- Focused unit checks: eight model/Query/Runtime suites, 74 tests passed.
  Final result-materialization suite: 16 tests passed. Exact Query/model types:
  three suites / six tests passed, no source/type errors. Root yarn typecheck
  and focused ESLint passed; the existing QueryBuilder soft size warning remains.
- Permissioned yarn validate:full passed, exit 0: format, root typecheck,
  560 files / 2702 unit/type/performance tests, sequential lint/build, complete
  source/PostgreSQL coverage (639 files / 2966 tests), 22 issue checks,
  dependency constraints and 66 public documentation tests. Existing soft
  warnings remain 53 in Core and 29 elsewhere.
- Final coverage across the same 731 files: statements 23771/26057 (91.22%),
  branches 14704/17356 (84.71%), functions 5010/5189 (96.55%), lines
  23047/25111 (91.78%). All percentages improve; uncovered counts fall in
  every metric. No missing or regressed unchanged file in the JSON comparison.
- Rebuilt Core index.d.ts is byte-identical to the baseline (SHA-256
  37533f47cef296840a88e65b3626c9a24259be2187b931ec88aa2daa171a59f7).
- Current production diff: models -38, inclusions -9, results -28; total
  +55 / -130 = -75. Core is now 372 files / 70108 lines. No measured Runtime
  speedup is claimed. Logs and baseline artifacts are under
  /private/tmp/ultimabase-core-followup.489NjN/.

## Acceptance criteria

- [x] Prove or reject direct normalized persisted-model commands with identical protected execution and projection behavior.
- [x] Prove or reject simpler inclusion normalization with stable replacement order, immutable branches and exact target checks.
- [x] Prove or reject result materialization using existing classifications, preserving exact models, errors and nullable/scalar/collection behavior.
- [x] Remove rejected trials and record net production/test/documentation lines and coverage comparison.
- [x] Audit the whole diff, fix findings, pass focused/compiled/full validation and inspect a dedicated local commit.

## Final audit

- All three trials retained; no rejected production implementation remains.
  The complete diff preserves public authoring/exports, exact result inference,
  errors, private ownership/identity, selection independence, immutable models
  and builders, target checks, transactions and Runtime order. No finding remains.
- yarn test:e2e:built passed with required permissions after the final build:
  102 files / 410 tests, exit 0, including compiled declarations, editor checks,
  package archives, listeners and PostgreSQL consumers. No failed, skipped,
  flaky, interrupted or unavailable required check remains.
- Production: +55 / -130 = -75; tests: +126 / -1 = +125. Documentation:
  +120 / -9 = +111, including this issue/checkpoint and the internal Query guide.
  Whole diff: +301 / -140 = +161; the increase is tests and engineering evidence.
- Assessment: two fewer model helpers and one fewer private facade; no model
  builder hydration/casts; no inclusion remapping or nested duplicate search;
  one collection mapping and one singular materialization using existing facts.
  No new abstraction, dependency, public type or generated contract. Runtime
  speedup is not benchmarked; the exact same compiled declaration is the DX proof.
- Potential later work: internal relation lookups still construct neutral
  builders. That separate follow-up is not included in these three trials.
