# 3005: Remove unused declaration and Typegen powers

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, official plugins
- Depends on: 3004
- ADR: ADR-0259

## Goal

Remove only declaration, query, command, and Typegen extension levels proven
unused by issue 3001 and explicitly approved in issue 3003, while preserving
graph-derived Typegen and every retained plugin surface. The exact approved
scope is R-005–R-008 and R-010 in ADR-0259.

## Acceptance criteria

- [x] Remove destructive schema field/index/constraint/option patches and the
      replacement variants of option setters, including `schema:transform`.
      Retain additive patches, selectors, options, ownership/provenance checks,
      and duplicate/conflict rejection; never introduce last-writer-wins.
- [x] Remove arbitrary schema/model plugin-operation targets, generic
      `schemaCommands`/`modelCommands`, and their handle/Typegen projections.
      Retain application operations, Password Auth factory methods, native
      model CRUD, and actual schema mutations on schema/model handles.
- [x] Remove exactly the unused powers selected by issue 3003, including their
      privileges, registrars, IR nodes, snapshot data, generators, public
      exports, examples, documentation, and tests.
- [x] If implementation reveals a new actual consumer or retained editor,
      JavaScript, security, or lifecycle behavior that cannot be preserved,
      stop and reopen the decision before deleting it. Existing self-tests or
      documentation of an approved unused API do not require approval again.
- [x] Retain graph-derived schema, field, option, operation, schema-mutation,
      model, and transport typing used by current applications.
- [x] Retain only manual public type-reference or declaration facts with a
      proven production consumer and no graph-derived equivalent.
- [x] JavaScript applications continue to execute the same Runtime graph without
      Typegen or generated JavaScript.
- [x] Removing one power cannot leave a private registry, inert metadata branch,
      stale privilege, compatibility alias, or undocumented deep import.

## Tests

- [x] Source and packed language-service tests prove retained autocomplete,
      hovers, strict negative cases, first generation, stale replacement, and
      no-Typegen JavaScript behavior.
- [x] Public export, manifest, fingerprint, deterministic generation,
      typecheck, lint, build, constraints, and relevant E2E pass.

## Audit gate

- [x] Audit the final graph and generated declarations for both missing retained
      types and surviving unused extension paths. Correct and repeat the complete
      audit until green.
- [x] Record final line, file, export, test, and duration deltas plus
      Documentation impact before completion.

## Out of scope

- Redesigning TypeScript syntax or adding a new Typegen extension mechanism.

## Implementation and audit handoff

Delivered exactly R-005–R-008/R-010 from ADR-0259. Core no longer exposes Query
extension registrars, destructive patch factories or replacement targets,
arbitrary schema/model operation targets or their command maps, or manual
Typegen declarations and extra outputs. Their privileges, IR branches,
registrars, handle projections, snapshot fields, generators, and public
exports are removed. Six superseded transformation files had no remaining
caller and are deleted; the canonical additive compiler is the only path.

Retained behavior includes application operations and their exact owner-bound
codecs, native schema/model CRUD, Password Auth factory methods, actual schema
mutations, additive fields/indexes/constraints/options, selector provenance,
and consumed nominal Typegen references. Graph-derived schema, field, option,
operation, mutation, select/include, editor, and transport types remain. Core's
generated contract version is 20, Typegen's generator version is 19, and its
snapshot version is 11. The committed Minimal and Todo declarations were
regenerated. Explicit declaration-file writing utilities remain used by
Typegen startup, project generation, and build integrations; the removed
plugin output registry has no compatibility replacement.

The complete removal and retained-behavior audit is green with no unresolved
finding. The loop covered production source, public and packed exports,
JavaScript fixtures, generated declarations, capability privileges, exact
owners, transactions, disposal, schema provenance, unchanged product plugin
behavior, examples, and website pages. Findings corrected before the final
re-audit included an additive index validation accidentally removed with the
replacement branch, stale generated examples and JavaScript command fixtures,
a mixed conformance fixture that still needed real schema mutations, redundant
application-target checks after nominal token validation, and outdated
Typegen prose. The index boundary has a regression test; new tests also cover
atomic duplicate option rejection, retired setters/maps/privileges, and exact
Typegen reference ownership. Retained JavaScript checks still exercise native
handles, dynamic schemas, operation execution, safe transport errors, and
conformance without Typegen. No old extension was recreated under a new API.

Validation:

- `yarn typecheck` passed; the final full rebuild of both TypeScript projects
  also passed with `yarn tsc --build --force tsconfig.json tooling/tsconfig/test.json`.
- `yarn test --maxWorkers=2`: 522 files, 2,500 tests, no type errors, 185.33 s.
  After the final audit fixes, 10 affected unit/backlog files and 54 tests
  passed separately, including the new additive-index regression.
- Final `yarn build`: passed, 36.406 s, including package declaration checks.
- Final `yarn test:e2e:built --maxWorkers=2`: 97 files, 378 tests, 124.03 s.
  This includes PostgreSQL, package archives, editor contracts, JavaScript,
  REST, GraphQL, Password Auth, Soft Delete, and alternative plugin engines.
- Final `yarn website:validate`: 17 files, 66 tests, 12.96 s.
- `yarn constraints`: passed. Backlog validation is included above.
- All lint scopes passed with `NODE_OPTIONS=--max-old-space-size=6144`:
  53 Core line-budget warnings, 28 package warnings, and no errors.
- Changed-file formatting and `git diff --check`: passed.

The first E2E run identified the stale declarations and retired JavaScript
fixture; the complete final run above passes after their correction. No
coverage threshold, exclusion, or CI configuration changed. Complete coverage
was not rerun for this issue; these results do not claim a CI run or a CI speedup.

Measurements use `yarn measure:simplification` after the final build, compared
with the pre-change revision `5adb09b3`:

| Measure                       |  Before |   After |   Delta |
| ----------------------------- | ------: | ------: | ------: |
| Production TypeScript files   |     701 |     695 |      -6 |
| Production TypeScript lines   | 132,172 | 127,693 |  -4,479 |
| Core TypeScript files         |     337 |     331 |      -6 |
| Core TypeScript lines         |  72,204 |  68,298 |  -3,906 |
| Test/support TypeScript files |     691 |     693 |      +2 |
| Test/support TypeScript lines | 130,222 | 128,406 |  -1,816 |
| Public exports                |   1,768 |   1,727 |     -41 |
| Built entry declaration bytes | 877,877 | 859,337 | -18,540 |

Core's production-line share changes from 54.63% to 53.49%. Local validation
samples compared with issue 3004 change by +24.12 s for the full unit/type/
performance suite, -9.551 s for build, -6.28 s for E2E, and -12.51 s for the
website suite. Cache and machine contention vary; these are recorded samples,
not a measured complexity percentage or performance guarantee. The retained
Runtime counter tests remain green.

Documentation impact: both. Core, Typegen, and Plugin Kit READMEs, root
architecture and agent guidance, the internal authoring guide and schema
examples, and the affected plugin-authoring/type-generation/troubleshooting
pages under `apps/website/content/docs` follow the removals. Other reviewed
package READMEs remain accurate: their supported product contract is unchanged;
the Auth type alias only drops a redundant generic argument. The schema
examples were reviewed because the generated Core ABI changed, and their
obsolete patch/compiler examples were removed. Historical ADRs remain intact.

Scope: the explicit user request adds the root `HISTORIQUE_SUPPRESSIONS.md`
ledger and makes its per-issue update mandatory in `CURRENT_PLAN.md`. The
schema example's obsolete compiler-replacement section, missed by issue 3004,
was removed as part of the required example audit. No new architecture or
product feature was introduced. Preserve the unrelated editor setting and the
suspended Soft Delete stash.

The next issue is 3006 after this dedicated local commit. No push is authorized;
issue 3014 remains the hard stop.
