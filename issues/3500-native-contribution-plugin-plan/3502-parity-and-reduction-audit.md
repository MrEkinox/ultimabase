# 3502: Prove parity and audit the reduction

- Status: completed
- Milestone: 35
- Depends on: 3501
- ADR: ADR-0271

## Goal

Prove complete behavior parity and measure whether the native plan actually
reduces Core and test complexity while improving plugin-author diagnostics.

## Acceptance criteria

- [x] Full validation and coverage pass without regression.
- [x] The removed bridge has no implementation, type, test, or documentation
      remnants outside historical ADRs and completed issues.
- [x] Production and test line changes are compared with milestone 34's final
      commit `8800ea99`.
- [x] Remaining plugin-author complexity and justified follow-up work are
      recorded.

## Handoff

- Documentation impact: internal engineering documentation. This issue records
  the completed parity and reduction audit; public authoring changes were
  documented with issue 3501.

## Validation

- `yarn typecheck`: passed.
- `yarn build`: passed, including package export checks.
- `yarn lint`: passed with 52 existing line-budget warnings and no errors.
- `yarn constraints`: passed.
- Full unit, type, and performance run: 538 files and 2,555 tests passed.
- Full instrumented run: 613 files and 2,802 tests passed with no type errors.
- Coverage: 90.49% statements, 83.91% branches, 95.79% functions, and
  91.10% lines.
- `yarn website:validate`: 17 files and 66 tests passed.
- `yarn check:issues`: 9 tests passed.
- Every touched file passes Prettier. The repository-wide format check still
  reports two untouched pre-existing files:
  `apps/website/content/docs/1.0.0/reference/package-index.mdx` and
  `apps/website/tests/plugins.content.test.ts`.

## Reduction from `8800ea99`

The implementation commit changes 43 files with 841 added and 1,347 removed
lines, a net reduction of 506 lines. The useful breakdown is:

| Scope                                | Added | Removed |  Net |
| ------------------------------------ | ----: | ------: | ---: |
| Implementation excluding Markdown    |   635 |   1,319 | -684 |
| Core production source               |   420 |     787 | -367 |
| Runtime and type tests               |    98 |     364 | -266 |
| Official non-Core plugin aliases     |   117 |     168 |  -51 |
| Documentation, ADR, issues, and plan |   206 |      28 | +178 |

Milestone 34 ended at net +2,001 lines versus its own baseline. This native-plan
change removes 506 of them, so the combined authoring migration now stands at
net +1,495 lines while retaining the public contribution factories, tests,
official migrations, and documentation added by milestone 34.

## Result

The reduction is structural rather than cosmetic:

- one contribution list now compiles directly into one immutable Core plan;
- operation contributions are compiled once rather than once for privilege
  discovery and again for execution;
- capabilities and conditional permission reasons are normalized once;
- the lifecycle manager owns the resource returned by
  `contributeApplication()` directly;
- the synthetic setup callback, hook table, resource `WeakMap`, old compiler,
  and its bridge-only tests are gone;
- lifecycle-only resources omit `exports` and normalize to `undefined`;
- `PluginInstance` and `FrameworkPlugin` use named contract fields instead of
  positional internal-bucket generics.

This is a clear DX improvement for plugin authors: the public shape now matches
the Core model, diagnostics name contributions and permissions, no hidden
second authoring system needs to be understood, and named plugin types no
longer require placeholder `undefined` arguments. Runtime capability and
security semantics remain unchanged.

## Remaining opportunities

1. Official plugin aliases still repeat identity and version facts already
   present in their factory. A focused follow-up could derive more aliases from
   `ReturnType<typeof factory>` without changing authoring behavior.
2. `plugin()` retains a large internal generic signature to preserve precise
   contextual typing. It could be studied as a type-only simplification, but
   only with language-service tests proving that callback autocomplete and
   exact capability inference do not regress.
3. `plugin-contributions.ts` now owns several nominal factory families and is
   above the warning threshold. Splitting it by contribution domain would
   improve maintenance, but would not reduce public DX or total behavior, so it
   should remain separate from this architectural cleanup.
4. Permission reasons should remain explicit. Auto-generating them would save
   lines but weaken the reviewable security contract and is not recommended.
