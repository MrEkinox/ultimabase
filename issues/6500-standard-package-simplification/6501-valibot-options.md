# 6501: Test Valibot option normalization

- Status: completed
- Milestone: 65
- Packages: rest-plugin; other option normalizers only after the canary succeeds
- Depends on: 6401
- ADR: none; this experiment must preserve existing contracts

## Working context

- Scope: compare a real REST schema-route normalizer with Valibot. Retain only
  a simpler exact replacement; no Core validation or public API redesign.
- Current contracts: [REST](../../packages/rest-plugin/README.md),
  [option parsing](../../packages/plugin-kit/README.md#parse-plugin-options-once),
  [validation](../../docs/adr/0275-canonical-repository-validation.md).
- Locked decisions: preserve sparse omission, explicit undefined rejection,
  string/symbol and non-enumerable keys, plain-object rules, detached frozen
  output, diagnostics and public named/JSDoc interfaces. No validator imposed on users.
- Rejected approaches: raw strictObject (14/23 differences); plain/own-key
  guarded strictObject (4/23 differences). Reopen only for a different boundary
  or a concrete replacement preserving diagnostics without restoring the manual traversal.
- Proof commands: real-normalizer differential canary; affected unit/type checks;
  correctly permissioned `ULTIMABASE_COVERAGE_WORKERS=2 yarn validate:full`.
- Exploration budget: two comparable failed variants or 30 minutes without
  verifiable progress; validation wait excluded.
- Next action: none; the rejected experiment is closed without production changes.

## Acceptance criteria

- [x] Compare valid, malformed, exotic and multiply-invalid values with the real implementation.
- [x] Measure net handwritten production code including compatibility glue.
- [x] Retain only a simpler parity-proven implementation, otherwise remove the experiment.
- [x] Audit the diff, record evidence/documentation impact and pass the full gate.

## Experiment decision

Rejected after two bounded differential variants against the real
`normalizeRestSchemaRoutes`, not a synthetic reference. All 23 cases compare
returned values, root/nested freezing, exception class and complete message.
The corpus includes omission, explicit undefined, null-prototype/class objects,
symbols, non-enumerable own keys, nested bulk and multiply-invalid options.

- Raw: 14 differences, including accepted unknown keys/class objects and diagnostics.
- Guarded: 4 differences remain. `{ create: 'bad', unknown: true }` reports
  unknown instead of the earlier invalid boolean; `{ get: 'bad', create: 'bad' }`
  switches the diagnosed property; nested union errors lose the `bulk.upsert` path.
- Existing validation declarations: 55 statement lines. The candidate's schema
  declarations plus raw parser: 36 lines, but not equivalent. With own-key/plain
  compatibility guards: 63 lines, already larger and still not equivalent.
  Imports, public interfaces and the differential harness are excluded on both sides.
- Restoring exact traversal order would preserve the current manual logic plus
  the schema layer. No broader migration is justified by this failed canary.
- Production, dependencies, public exports and named/JSDoc interfaces: unchanged.
- Canary: `node /private/tmp/ultimabase-6501-valibot-canary.mjs` exits 0 and reports
  both differences; exploratory code is outside the repository, not shipped.
- Documentation impact: internal engineering documentation. No public or package
  behavior changes; existing website and package option contracts remain accurate.

## Validation and audit

- `ULTIMABASE_COVERAGE_WORKERS=2 yarn validate:full` passes with required
  Docker/listener permissions: 559 ordinary files/2,673 tests, 638 coverage
  files/2,937 tests, no type errors, 22 metadata tests and 66 website tests.
  Formatting, lint, build, compiled export checks and constraints pass.
- Baseline covers 729 production files: statements 23,789/26,146 (90.98%),
  branches 14,693/17,384 (84.52%), functions 4,999/5,202 (96.09%),
  lines 23,065/25,192 (91.55%). Raw counters saved outside the checkout for 6502.
- Full-gate log: `/private/tmp/ultimabase-6501-baseline-validation.log`.
  Existing file-size warnings remain; no failed/skipped required gate.
- Whole-diff audit: only sequence bookkeeping/evidence; no production, package,
  test discovery, threshold or user-owned changes. No unresolved finding.
