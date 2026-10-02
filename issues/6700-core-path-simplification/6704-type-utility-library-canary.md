# 6704: Test standard type utilities against real Core consumers

- Status: completed
- Milestone: 67
- Packages: core
- Depends on: 6703
- ADR: 0275, 0279

## Goal

Test published `type-fest` utilities on existing Core type boundaries. Retain
only a worthwhile net simplification with unchanged inference, diagnostics,
readonly semantics and source/packed editor behavior. Reject and roll back an
unhelpful dependency; this does not authorize a broad type architecture change.

## Acceptance criteria

- [x] Compare actual helper behavior, including empty shapes and readonly input.
- [x] Exercise real query, field-value, model and update consumers.
- [x] Check source and compiled editor contracts and compiler diagnostics.
- [x] Count net production changes and declaration/dependency costs.
- [x] Remove rejected changes; complete full validation before retaining code.
- [x] Audit the final diff and record the decision and proof limits.

## Working context

- Scope: bounded type-only trial in Query result/update, field value-map and schema model contracts; no generated graph, Runtime or public API redesign.
- Current contracts: Core README static compilation; Core schema guide inferred data shapes/generic fields; Core Query guide canonical reads/writes/results; current architecture retained typing boundaries; ADR-0275 and ADR-0279.
- Locked decisions: Typegen remains the sole named graph; preserve readable hover, exact inputs and immutable models; count imports/adapters, not gross removals; no push authorized.
- Rejected approaches: published type-fest substitution saves only six production lines and adds a public type dependency; reopen only for a materially larger proven generic utility need. Existing global-inference and hover flattening failures remain closed.
- Proof commands: root `yarn typecheck`; test-project `tsc --extendedDiagnostics`; focused source/type/editor tests; Core build and affected packed editor checks; `yarn validate:full` if code is retained, documentation checks if fully rolled back.
- Exploration budget: two comparable failed variants or 30 minutes without verifiable progress, excluding validation wait.
- Next action: none; trial rejected and rolled back. Await a new user-approved target.

## Documentation impact

internal engineering documentation

The developer API and Typegen boundaries are unchanged. Public website,
package contracts and schema examples need no edit for this rejected trial.

## Evidence

Baseline HEAD is `8b824539`; the clean checkout had nine unpushed commits and
no incoming changes after `git fetch origin --prune`.

### Trial and decision

Tested published `type-fest@5.10.0`, not copied implementations. Replaced two
ordinary `Simplify` helpers, adapted one readonly model helper, reused
`Simplify` inside the existing conditional update helper, and adapted
`RequireAtLeastOne` to the readonly update contract. The readonly-only
source-field helper and the retained Typegen graph were not changed.

**Rejected and rolled back:** four production files changed by +13/-19 lines,
net -6. The manifest and lockfile added another 18 lines. Installation added
two packages (`type-fest` and `tagged-tag`), 608.3 KiB of fetched cache archives.
No JavaScript runtime dependency was introduced by the type-only imports, but
the bundled public declarations retained an external `type-fest` import,
requiring consumers to resolve its package. Declaration bytes fell only from
667,501 to 667,090 (-411).

The existing test-project compiler loaded 2,612 -> 2,828 files and
227,729 -> 245,464 declaration lines (+17,735). Type instantiations changed
9,760,944 -> 9,804,728. One isolated pass took 33.99 -> 35.61 seconds total
(checking 31.41 -> 32.91 seconds); single-run timing is noisy and establishes
no statistically significant speed regression or improvement.

The two Core `UnionToIntersection<never>` helpers evaluate to `unknown`;
the library version evaluates to `never`. Direct replacement would erase the
empty-contribution identity. A small compiler probe also inspected partial
nested exact-input shapes; the library materializes a different contract-based
shape. Neither utility was migrated, and no compatibility adapter was added.
These probes supplement, not replace, the real consumer checks below.

### Checks

- Baseline and candidate: `yarn tsc --project tooling/tsconfig/test.json --extendedDiagnostics`, exit 0; candidate `yarn typecheck`, exit 0.
- Focused `yarn vitest run --project unit --project types`: query builder, update application, model lifecycle/readonly, schema definition, embedded object, canonical Query hover, FieldBuilder completion; 7 files, 19 tests, no type errors.
- Candidate `yarn workspace @ultimabase/core build`: exit 0, ATTW and Publint passed.
- `yarn vitest run --project e2e packages/core/tests/e2e/core-public-query-types.e2e.test.ts packages/core/tests/e2e/core-plugin-source-projection.e2e.test.ts packages/core/tests/e2e/core-source-schema-profiles.e2e.test.ts`: 3 files, 11 tests, passed, including source/packed 1/10/50-schema profiles.
- Candidate `yarn constraints`: exit 0.
- Actual plugin-language-service fixture comparison: zero diagnostics and identical completion names at all 3 markers, source and packed. All 6 source hovers matched byte-for-byte. Two packed method hovers changed only the bundled internal alias spelling `Simplify` -> `Simplify$1`; selected model fields, method documentation and examples remained intact. Concurrent editor probes were used for parity, not timing claims.
- Rollback: source, package manifest and lockfile match HEAD; `yarn install --immutable`, Core build, exact declaration-byte comparison and `yarn typecheck` passed.
- Final documentation: focused Prettier check, `yarn check:issues` (2 files, 22 tests), and `git diff --check` passed.

Raw logs and temporary probes: `/private/tmp/ultimabase-type-fest.yP0gNq`.
No experiment code, tests or dependency remains. `yarn validate:full`
was not run: this is a rejected trial with no retained production refactor,
not a claim of full-suite validation. No API, examples, package contract or
public website prose changes are needed. Final audit: no findings; only the
experiment record and aligned issue/milestone/checkpoint/catalog remain.
