# 3004: Remove unused replacement and observer powers

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/testing`, plugin documentation
- Depends on: 3003
- ADR: ADR-0259

## Goal

Remove only the generic capability decoration and replacement machinery that
issue 3001 proves unused and the user explicitly approves in issue 3003,
including specialized compiler/Runtime replacement and the unused generic Core
observer path. The exact approved scope is R-001–R-004 and R-009 in ADR-0259.

## Acceptance criteria

- [x] Move the current four Runtime cost scenarios to equivalent internal
      instrumentation of canonical assembly and stage calls before removing
      the public Testing probe and its five exports. Preserve database-work
      assertions without a public metrics API, production test switch, or
      cross-package private production import.
- [x] Remove the generic Core observer token, `provideRuntimeObserver`,
      `postCommitEvent`, and their exclusive contracts/assembly. Retain
      `runtime:observe`, official Hooks/Access event and diagnostic capabilities,
      post-commit delivery, rollback suppression, and callback attribution.
- [x] Remove selected replacement and decoration definitions, privileges,
      planning, lifecycle branches, public exports, inspection metadata,
      examples, documentation, conformance fixtures, and packed declarations.
- [x] Change only symbols on issue 3003's explicitly approved removal list. If
      implementation reveals a new actual consumer, a public contract outside
      the approved removal, or a required invariant that cannot be preserved,
      stop and reopen the decision before deleting it. Existing self-tests or
      documentation of an approved unused API do not require approval again.
- [x] The canonical schema compiler and Runtime executor become direct Core
      implementation boundaries without a dormant public replacement protocol.
- [x] Preserve compiler integrity/provenance and Runtime authority/transaction
      checks even where old regression tests used a removed replacement seam.
- [x] Retained single, multiple, and pipeline provider composition continues to
      support every current cross-plugin interaction and supported contract
      identified by issue 3001.
- [x] Privilege policy and diagnostics reject removed names rather than silently
      accepting inert declarations.
- [x] No compatibility alias, no-op replacement, private official bypass, or
      second capability graph remains.

## Tests

- [x] Source, type, JavaScript, packed-export, manifest, privilege, capability,
      lifecycle, plugin conformance, and performance tests cover the smaller
      contract and absence of removed APIs.
- [x] Relevant repository typecheck, unit tests, lint, build, constraints, and
      package archives pass.

## Audit gate

- [x] Run a removal audit for every deleted symbol and protocol, then audit all
      retained providers for composition and lifecycle regressions. Fix every
      finding and repeat both audits until green.
- [x] Record final line, file, export, test, and duration deltas plus
      Documentation impact before completion.

## Out of scope

- Removing retained contribution powers or implementing the canonical
  command graph.

## Implementation and audit handoff

The change implements exactly R-001–R-004/R-009 in ADR-0259. Ordered provider
planning replaces replacement chains; manifest groups are now `provides`,
`requires`, and `optional`. Core directly invokes its canonical compiler and
constructs its Runtime pipeline. Compiler output validation, artifact ownership,
field provenance, required stages, authority, and transaction boundaries remain.
The removed compiler protocol types and selection metadata had no consumer
outside the approved replacement surface. The internal compiler IR remains.

The generic Core observer path is removed. Product-owned Hooks/Access events
and diagnostics, `runtime:observe`, and the existing Runtime behavior
`postCommit` stage remain. Regression fixtures now exercise the retained stage
for commit ordering, rollback suppression, and logical Soft Delete identity.
No official product plugin implementation changes in this issue.

Runtime cost measurement now lives in Core test support. A test-local module
interception wraps the real pipeline constructor; there is no production
switch, exported metrics API, or cross-package private production import.
Before removing the public probe, a temporary comparison ran both instruments
against all four configurations and the injected neutral-stage control: startup
and request counters were deeply equal. The retained suite still asserts zero
optional work without product engines, one assembly, one read, one prepared and
executed mutation, one transaction/commit, and detection of a neutral stage.

The final removal and retained-behavior audits are green with no unresolved
finding. The audit checked source and packed exports, declaration output, manifest and
privilege rejection, single/multiple/pipeline composition, exact instance
ownership, conditional requirements, resource cleanup, compiler integrity,
Runtime enforcement, and the affected public documentation. Findings corrected
in the loop included an unused replacement-only factory retention helper,
stale manifest assertions and imports, a negative type assertion split by
formatting, a website sentence referring to a removed table row, and a retired privilege
in the internal plugin-authoring guide. A focused
regression confirms duplicate contribution IDs remain local to an exact plugin
instance. Removed self-tests concerned only the approved retired powers;
retained compiler, ownership, lifecycle, event, and Typegen invariants were
migrated to the canonical paths instead of deleted.

Validation:

- `yarn typecheck`: passed; the final test-only additions also pass
  `yarn tsc --project tooling/tsconfig/test.json`.
- `yarn test --maxWorkers=2`: 520 files, 2,504 tests, no type errors, 161.21 s.
  The subsequent ownership regression passes separately (8 tests in its file).
- `yarn build`: passed, 45.957 s.
- `yarn test:e2e:built --maxWorkers=2`: 97 files, 378 tests, 130.31 s,
  including packed exports, generated types, PostgreSQL, Auth, Soft Delete,
  REST, GraphQL, and JavaScript without Typegen.
- `yarn website:validate`: 17 files, 66 tests, 25.47 s.
- `yarn constraints`: passed; active-documentation/backlog checks: 14 tests.
- Lint: all three scopes pass with `NODE_OPTIONS=--max-old-space-size=6144`;
  60 existing Core line-budget warnings and 28 package warnings, no errors.
- Changed-file formatting and `git diff --check`: passed.

The first sandboxed run could not open local test listeners. The successful
full run used the authorized local network/test environment. Earlier compiled
language-service and website timeouts under concurrent heavy validation did
not recur with bounded workers. The default lint heap was exhausted; the final
run uses the baseline's existing 6 GiB setting without changing project limits.
No coverage exclusion or threshold changed; complete coverage was not rerun.

Measurements use `yarn measure:simplification` after the final build, compared
with the pre-change revision `f7e9596b`:

| Measure                       |  Before |   After |   Delta |
| ----------------------------- | ------: | ------: | ------: |
| Production TypeScript files   |     706 |     701 |      -5 |
| Production TypeScript lines   | 134,104 | 132,172 |  -1,932 |
| Core TypeScript files         |     341 |     337 |      -4 |
| Core TypeScript lines         |  73,748 |  72,204 |  -1,544 |
| Test/support TypeScript files |     689 |     691 |      +2 |
| Test/support TypeScript lines | 131,314 | 130,222 |  -1,092 |
| Public exports                |   1,832 |   1,768 |     -64 |
| Built entry declaration bytes | 902,767 | 877,877 | -24,890 |

Core's production-line share changes from 54.99% to 54.63%. These are structural
reductions, not a claimed complexity percentage. Timings use two test workers
and include local contention; they are not comparable to the baseline's
90.16 s default-worker test sample or evidence of a CI speedup. Deterministic
Runtime work counters remain the performance parity gate.

Documentation impact: both. Core/Testing/Plugin Kit READMEs, root architecture, the plugin-authoring guide,
and agent guidance, and the affected plugin-authoring/troubleshooting pages
under `apps/website/content/docs` follow the removed public APIs. HTTP,
Soft Delete, and Typegen package contracts remain accurate: only their fixtures
change. No production file under `core/src/schema` changes. Historical ADRs
remain intact and are superseded by ADR-0259.

Scope: no implementation beyond the approved acceptance criteria. The next
issue is 3005 after this dedicated local commit.
No push; hard stop after 3014.
