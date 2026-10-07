# Package test ownership handoff

User-requested maintenance, 2026-09-19. This is the test-organization prerequisite
for selective CI; GitHub workflows and dependency-based scheduling are unchanged.

## Delivered scope

- Move 66 existing E2E suites to the package whose contract they verify, including
  their dedicated fixtures. Keep full-application composition, transport parity,
  alternative-engine proofs, and repository inventory at the root.
- Extract the 22 Core declaration/archive assertions from the repository archive
  suite into Core's own built-export E2E suite, preserving their assertions.
- Keep shared PostgreSQL setup, worker isolation, and cross-package helpers in
  `tests/fixtures` with the existing one-container-per-project lifecycle.
- Preserve source-local type tests. Move the root Hooks declaration-support file
  into Hooks, and provide explicit option fixtures for isolated compiler projects.
- Add package `test:unit`, `test:types`, `test:e2e:built`, and `typecheck:tests`
  commands. `test` continues to select unit and type tests, never E2E.
- Keep root discovery and the production coverage include/exclude policy and
  thresholds. Add regression checks against actual Vitest inventories and
  TypeScript compiler roots.

No runtime source file, public export, dependency manifest edge, existing test
assertion, coverage threshold, or workflow filter was changed.

## Validation

- Discovery: all original files retained in their original projects after path
  normalization; 399 unit files (398 before plus the new guard), 109 type files,
  37 ordinary E2E files (36 before plus the Core archive split), 53 PostgreSQL
  E2E files, and both performance files.
- Root `yarn typecheck`, all 23 package `typecheck:tests` commands, `yarn lint`,
  and `yarn build` pass. Lint has 90 existing line-budget warnings and no errors;
  relocated oversized suites retain their original baseline values.
- `yarn website:validate`: 17 files / 66 tests pass. `yarn check:issues`: 9 tests
  pass. Documentation and test-discovery guards: 9 tests pass.
- Built E2E: all 363 assertions exercised; only the pre-existing Todo artifact
  mismatch failed. Regeneration then passes that unchanged 4-test suite.
- Package-scoped REST E2E: 4 files / 13 tests pass, including live PostgreSQL.
  Package-scoped REST types: 2 files / 2 tests pass with no compiler errors.

The reference is commit `1ff6f1f4`, installed and built in an isolated worktree.
Both coverage runs use two workers and the original complete project selection.
The final run passes **596 files / 2,695 tests**, with no type errors. The reference
contains 595 files / 2,691 tests; the four added assertions protect discovery.

All **702 production files** have identical per-file metric totals and covered
counts. No production file was added to or removed from the report. Global
metrics are also exactly identical:

| Metric     | Before | After  | Covered / total |
| ---------- | ------ | ------ | --------------- |
| Lines      | 89.31% | 89.31% | 24,751 / 27,712 |
| Statements | 88.76% | 88.76% | 25,469 / 28,694 |
| Functions  | 94.34% | 94.34% | 5,318 / 5,637   |
| Branches   | 81.77% | 81.77% | 15,787 / 19,305 |

The coverage comparison checks both percentages and raw counts per file, not
just rounded aggregate percentages. Coverage thresholds remain unchanged.

The reference already fails the Todo generated-declaration assertion: its checked-in
artifact lacks the current generator's `schemaClass` metadata. The reference run
uses `--coverage.reportOnFailure` to retain its complete coverage evidence without
skipping that test. The final tree regenerates the artifact from the existing Todo
application graph; its unchanged four-test built Typegen suite passes.

Full-repository formatting reports three pre-existing MDX files: `fields.mdx`,
`schemas.mdx`, and `related-data.mdx` under the public Core documentation. Running
Prettier on those same files in the untouched reference reproduces the failures.
They are outside this maintenance scope.

An additional check of the Todo example (`yarn workspace
@ultimabase/example-todo-backend typecheck`) reports the existing `TS2375` in
`src/todos.ts`: `TodoCreateInput` is passed where `TodoNestedCreateInput` is
required. The untouched reference reports the identical diagnostic, proving it
was not introduced by fixture regeneration. Root typecheck and all package test
programs pass; changing the example's application API is outside this scope.

## Scope exception

Regenerating `examples/todo-backend/.ultimabase/schema.generated.d.ts` repairs the
pre-existing fixture mismatch discovered during validation. It changes only the
fingerprint and three inert `schemaClass` declarations, with no runtime or test
assertion change.

## Documentation impact: both

Internal ownership, commands, and the decision are documented in `tests/README.md`,
Tooling READMEs, and ADR-0250. Package README links and public documentation source
metadata now point to the relocated evidence. Public user-facing behavior and
installation instructions remain accurate and unchanged.
