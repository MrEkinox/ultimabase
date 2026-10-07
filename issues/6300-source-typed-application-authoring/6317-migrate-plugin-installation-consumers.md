# 6317: Migrate plugin installation consumers

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/core`, repository consumers
- Depends on: 6312
- ADR: ADR-0279, ADR-0282
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Make `UltimaBase.use(plugin())` the sole public plugin installation form while
preserving the exact ordered plugin graph, policy, lifecycle, and Runtime
behavior. Keep the private `FrameworkApplication` plugin input; it is not a
public installation API. Do not migrate schema authoring or application handles
in this issue.

## Resolved architecture stop: dynamic plugin collections

- Baseline: `b48effa0`; 348 public `new UltimaBase({ plugins })` AST calls were
  separated from private `FrameworkApplication` inputs before editing.
- The public calls now use `.use()` or the zero-plugin constructor. The
  arbitrary arrays in HTTP test fixtures, official conformance, the Todo
  example, and the Runtime performance scenario use the same variadic entry
  point. Typegen loader source strings, 15 JavaScript fixture files, the
  website's compiled landing examples, and one type-only privilege test were
  also migrated after the initial AST inventory.
- A mutable factory loop was tested on the HTTP fixture. It fails TS2322:
  every `.use(plugin)` changes the exact tuple, while the constructor's
  `pluginPrivileges` contract makes configured factories invariant in that
  tuple. A widened
  `ConfiguredUltimaBaseFactory<readonly PluginDefinition[], PluginSourceState>`
  is not a sound assignment target. The failed local experiment was reverted
  and typecheck passed again.
- The user approved extending the one `.use()` entry point to a variadic
  tuple/list. ADR-0282 records the decision. Fixed-tuple and open-array source
  typing, immutable flat order, and empty spreads passed focused TypeScript and
  Runtime proof. The locked 1/10/50-schema TypeScript benchmark, root
  typecheck, and complete validation passed after the migration.

## Acceptance criteria

- [x] Inventory every public constructor-plugin consumer separately from the
      private `FrameworkApplication` graph and plugin privilege policy objects.
- [x] Migrate application, fixture, package, source/packed, and documentation
      consumers to immutable `.use()` calls or chains without changing plugin order,
      identities, instances, dependencies, privileges, or setup effects.
- [x] Remove the public `UltimaBase` constructor `plugins` option, its fallback
      reader, normalization branch, and migration-only types; an invalid JavaScript
      constructor input reports a focused error before plugin effects.
- [x] Zero-plugin construction remains `new UltimaBase({ schemas })`; configured
      construction remains `new App({ schemas })` with explicit registration.
- [x] No duplicate installation mechanism, helper graph, or broad public
      compatibility alias remains. Internal compilation still consumes one flat
      plugin tuple.
- [x] Package READMEs, public website pages, examples, and export tests reflect
      the canonical form; record exactly one Documentation impact classification.

## Tests

- [x] Source and packed type tests cover plugin order, two explicit instances,
      plugin absence, and rejected constructor installation.
- [x] Runtime and JavaScript tests cover privileges before effects, conflicts,
      lifecycle cleanup, worker isolation, and zero-plugin applications.
- [x] Locked TypeScript and Runtime budgets, dependency constraints, complete
      coverage, and `yarn validate:full` pass.

## Audit and commit gate

- [x] Record the baseline revision and bounded consumer inventory before edits.
- [x] Audit the diff for accidental changes to private `FrameworkApplication`,
      plugin privilege policy, plugin order, or other issue scopes; correct findings
      and rerun invalidated checks until none remain.
- [x] Complete every checkbox and required validation before marking completed.
- [x] Create one dedicated local commit, inspect its committed diff, and do not
      push without the user's explicit request.

## Out of scope

- Standalone `Schema.define()` removal (6318).
- Application-handle and ordinary explicit-selector removal (6314).
- Typegen projection pruning (6313).

## Handoff and audit evidence

The final syntax is:

```ts
const App = UltimaBase.use(firstPlugin(), secondPlugin())
const app = new App({ schemas: [Post] })
```

Chaining remains valid, and `new UltimaBase({ schemas: [Post] })` remains the
zero-plugin form.
The constructor `plugins` option, its fallback reader and public migration type
were removed. No schema declaration, application-handle, Typegen, plugin
identity, capability, policy, or Runtime pipeline contract changed. The one
flat internal plugin tuple and private `FrameworkApplication` input remain.

The final TypeScript AST inventory contains 116 constructor-shaped `plugins`
options: 111 private `FrameworkApplication` inputs and five intentional
public-constructor rejection tests. There is no surviving positive public
constructor-plugin consumer. The active website pages, package READMEs,
landing code, JavaScript fixtures, and Todo example use the canonical form.
Historical accepted ADRs and completed issue records remain unchanged.

The dedicated diff spans 191 files: 2,454 lines added and 2,359 removed, net
+95. Production source is +73/-92 (net -19); tests and fixtures are
+1,969/-2,224 (net -255); tooling is +3/-5 (net -2); engineering and public
documentation, including the new ADR, issue records, and benchmark evidence,
is +409/-38 (net +371). The large file count is the repository-wide consumer
migration, not an added Core bridge. The public `UltimaBaseOptions` export is
removed; no new public installer or Typegen output was added.

The locked benchmark measurements and their synthetic-Typegen caveat are in
[`evidence/6317-plugin-installation-benchmark.md`](evidence/6317-plugin-installation-benchmark.md).
`yarn validate:full` passed with 557 ordinary files/2,650 tests, 636 coverage
files/2,912 tests, zero type or lint errors, and 17 website files/66 tests.
Coverage was 90.88% statements (23,883/26,279), 84.39% branches
(14,758/17,486), 96.03% functions (5,020/5,227), and 91.45% lines
(23,157/25,322). Versus issue 6312, the function display drops by 0.01
percentage point as two covered functions were removed; the uncovered
function count remains 207. The complete built E2E passed 102
files/406 tests after updating the packed hover fixture.

| Iteration | Finding or evidence                                                                                                                                                            | Correction or decision                                                                                         | Validation result                                                                                | Remaining findings |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| 1         | A mutable loop for dynamic plugin arrays loses the exact factory tuple and its privilege policy type.                                                                          | The user approved the bounded variadic `use` extension in ADR-0282; no second installer or broad cast remains. | Focused source/packed, Runtime, typecheck, and benchmark proofs passed.                          | None.              |
| 2         | The first complete run found a Typegen Runtime fixture string still using constructor plugins.                                                                                 | Migrated that string and all 15 JavaScript fixture files.                                                      | Ordinary and coverage suites subsequently passed.                                                | None.              |
| 3         | The next run found one unused new type-test variable.                                                                                                                          | Kept the exact prefix-plus-dynamic-spread assertion and consumed its schema value.                             | Lint passed.                                                                                     | None.              |
| 4         | The next run found seven landing-content checks using old constructor snippets; the first focused correction exposed one colliding local name.                                 | Migrated the landing examples and gave the compiled test factory a distinct name.                              | Website validation passed 66/66, including the complete full gate.                               | None.              |
| 5         | The separate built E2E found one packed hover test searching for the removed syntax.                                                                                           | Pointed it at the documented `.use()` signature and kept its QueryBuilder check.                               | Focused archive tests passed 22/22; complete built E2E passed 406/406.                           | None.              |
| 6         | Final source, export, documentation, fixture, Typegen, dependency, plugin-order, and private-constructor diff review found no additional migration path or capability removal. | Keep schema authoring and remaining application paths for issues 6318/6314, and Typegen pruning for 6313.      | Absence inventory, `git diff --check`, full validation, built E2E, and locked benchmarks passed. | None.              |

- Documentation impact: both. The public constructor contract and examples
  changed in the Core/testing READMEs, root README, and application/plugin
  website pages and landing snippets; ADR-0282, the architecture index, and
  the milestone plan record the internal decision.
- Scope beyond original acceptance criteria: the user-approved variadic
  extension was necessary to migrate existing dynamic plugin collections
  without preserving a second installer. No other product feature was added.
- No push is authorized.
