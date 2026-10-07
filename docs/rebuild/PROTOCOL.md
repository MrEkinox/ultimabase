# Rebuild protocol for one package or Core domain

This repository reconstructs UltimaBase from the reference snapshot imported in
the first commit (reference commit `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`).
The original repository at `/Users/mrekinox/Desktop/claude-test/ultimadatabase`
is read-only: never write, build, install or run Git commands that modify it.

## Goal

Rewrite the internal implementation of the assigned scope so that it is simpler,
more readable and smaller, while preserving its public contract exactly.
Priority order: functional parity, security and DX > simplicity and
maintainability > code reduction > performance.

## Public contract (must not change)

- Runtime and type export names from the package `src/index.ts`, their
  signatures, generics, literal types and public JSDoc.
- `package.json` exports and published dependencies (removing an unused
  dependency is fine; adding one must be justified by real code removal).
- Observable behavior: results, ordering, transactions/rollback, hook order,
  post-commit effects, cleanup, error classes, codes and messages asserted by
  tests or documented in the package README, diagnostics, security checks
  (isolation, authorization, protected constraints, Master provenance,
  confidentiality).
- TypeScript DX: inference, exact types, negative cases (`@ts-expect-error`),
  completion, hover and diagnostics checked by language-service tests.

## Tests are the oracle

- Never modify: anything under the package `tests/` directory, any `*.test-d.ts`,
  any test outside the assigned scope, and any test importing only the public
  entry (`../index.js`, `./index.js` or `@ultimabase/*`).
- Internal tests (deep imports of modules you delete or rename) may be rewritten
  to target the new internals or the public API. Every behavioral assertion must
  survive with the same inputs and expectations. Never weaken an expectation or
  delete an assertion to obtain a green suite. If an internal-only invariant no
  longer exists because the mechanism is gone, write down what it protected
  and which remaining test proves the equivalent guarantee.
- Some files under a package `tests/` directory deep-import internal modules.
  When a rewrite removes or moves such a module, only the import specifiers (and,
  if strictly necessary, the imported internal helper name) may change so the
  file reaches the equivalent new internal. Assertions, inputs and expectations
  never change. Prefer keeping a small internal module with the same export.
  List every such edit explicitly.
- Record the mapping in the scope's `REBUILD.md`.

## What counts as simplification

Counts: removing indirection layers, duplicated normalization, single-use
wrapper types and helpers, merging tiny modules, replacing hand-written code with
a library when it clearly removes more than it costs (explain what it replaces).

Does not count: compacting formatting (Prettier is enforced), moving code into
another package or into tests, deleting tests, weakening validation, adding
`any`, unjustified `as` casts or broader types.

## Code rules

Same as the repository: strict typescript-eslint, no `any`, file budgets
(production fails above 600 lines, tests above 700), Prettier formatting,
English comments that explain intent and invariants, immutable domain objects.

## Validation (all in your worktree)

1. Once at the start: `yarn build`, then run the focused suites below on the
   untouched tree and note pre-existing failures.
2. `yarn build` (whole repository, about 45 s; unit tests consume `dist`).
3. `yarn vitest run --project unit packages/<pkg>`
4. `yarn vitest run --project types packages/<pkg>` when type tests exist.
5. `yarn vitest run --project e2e packages/<pkg>` and
   `yarn vitest run --project postgres-e2e packages/<pkg>` (Docker is available).
6. Consumers: find them with `git grep -l "@ultimabase/<pkg>" -- packages tests examples`
   and run their unit/e2e/postgres-e2e suites, plus `tests/e2e` in both e2e projects.
7. `yarn eslint packages/<pkg>`, `yarn prettier --check packages/<pkg>`,
   `yarn tsc --build packages/<pkg>` and `yarn tsc -p packages/<pkg>/tsconfig.test.json`.
8. `node tooling/measure-rebuild.mjs .` before and after; report the
   production lines of the scope.

## Deliverable

- Commits on your branch: `refactor(<pkg>): rebuild ...`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `packages/<pkg>/REBUILD.md`: design summary, production lines before/after,
  test mapping, pre-existing failures, any reference bug found (documented, not
  fixed), exact validation commands and results.
- Never push. Never touch other worktrees or the original repository.
