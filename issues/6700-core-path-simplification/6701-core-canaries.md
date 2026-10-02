# 6701: Test the four Core audit candidates

- Status: completed
- Milestone: 67
- Packages: core
- Depends on: none
- ADR: 0004, 0132, 0275, 0279, 0281

## Goal

Test each authorized audit candidate separately; keep only net simplification
with equivalent runtime behavior, public exports and source/packed editor DX.

## Working context

- Scope: schema-command QueryBuilder detours, repeated compilation validation, enum factory contracts, and filter kind facts only. No new public API, executor, dependency or generated graph.
- Current contracts: Core README; schema/query/runtime guides; ADR-0004/0132 one engine and schema writes; ADR-0279/0281 retained source/Typegen boundaries; ADR-0275 validation.
- Locked decisions: immutable inputs/models; protected identity outside AST; unique targeting; ordered atomic bulk operations; nested writes/includes; all-before-publication validation; root/embedded field restrictions; exact defaults/lists/extensions and readable editor types.
- Rejected approaches: no production trial rejected. Do not use truncated Zod method signatures or deliberately widened static metadata as exact field-hover probes; capture the builder result instead. Retained Typegen limitations and removed bridges are not reopened.
- Proof commands: focused schema-command/model/registry/enum/filter unit and type tests; root typecheck; affected rebuilt Core packed/editor checks; permissioned yarn validate:full before completion/commit.
- Exploration budget: two comparable failures or 30 minutes without verifiable progress per trial, excluding validation waiting. Roll back only the rejected experiment and explain before expanding scope.
- Next action: none for implementation. Full and compiled validation passed; audit complete. Inspect the dedicated local commit before handoff; no push authorized.

## Documentation impact

Internal engineering documentation. Review Core contracts, schema examples and
public website ownership/pages; no public edit if the retained contract is unchanged.

Core README, query/schema guides and the field-builder example are updated.
The example's callback timing now matches the existing capture-at-definition
contract. Reviewed website ownership and Fields, Filters, Embedded Objects,
Models, Update, Upserts, Delete and Bulk Operations: developer declarations,
restrictions, errors and execution behavior are unchanged, so no public page edit
is required. No new architectural decision or dependency requires an ADR.

## Acceptance criteria

- [x] Prove or reject direct mutation normalization without losing protected execution or projection semantics.
- [x] Prove or reject removal of repeated schema validation while preserving atomic publication and sequential reuse checks.
- [x] Prove or reject enum contract sharing with exact source and compiled hover/completion/diagnostics.
- [x] Prove or reject shared filter compatibility without domain cycles or changes to generated WHERE contracts.
- [x] Remove rejected experiments and record net production/test/documentation lines.
- [x] Audit retained changes; pass focused, packed and full validation before a dedicated local commit.

## Trial evidence

| Trial       | Retained simplification                                                                                                                                   | Net production lines |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Mutations   | Five AST hydration call sites removed; reuse existing normalized Query inputs and executor union. Protected model/relation scope remains outside the AST. | -6                   |
| Compilation | One compatibility-validation pass, followed by separate atomic publication; compatible reused records return before unnecessary target copies.            | -2                   |
| Enums       | One callable contract for both contexts, reusing existing source-option resolution; preserve different root/embedded metadata and named result options.   | -65                  |
| Filters     | Shared equality/ordering kind facts live in schema foundations, not a Schema-to-Query dependency; nested numeric paths remain equality-only.              | -1                   |

Production accounting includes both new shared files: **+262 / -336, net -74**.
No package, public export, Typegen contract, executor or runtime stage was added.
No wall-clock performance improvement is claimed from the removed allocations.

- Focused runtime/schema/filter/editor checks: `yarn vitest run --project unit`
  with the affected twenty suites; **20 files / 164 tests passed**.
- Exact enum and source-filter types: `yarn vitest run --project types`
  with `field-builder.test-d.ts`, `source-type-info.test-d.ts` and
  `enum.test-d.ts`; **3 files / 13 tests passed, no type errors**.
- Rebuilt consumers: FieldBuilder, field diagnostics, public Query types,
  source schema profiles and plugin source projections; **5 files / 21 tests
  passed**. The additional validator-independent value-hover regression then
  passed in FieldBuilder's **10-test** suite.
- Built PostgreSQL runtime, relations, nested public writes and GraphQL/REST
  parity: `yarn vitest run --project postgres-e2e` with the four affected
  vertical suites and required permissions; **4 files / 18 tests passed**.
- Root `yarn typecheck`, rebuilt `yarn build` and focused ESLint passed.
  The pre-existing schema-command file-size warning remains below the hard limit;
  the file shrank from 537 to 532 lines.

### Editor probes and corrected test failures

The initial new packed assertion expected an untruncated method signature with
Zod. Comparing the actual consumer with both old and new source contracts proved
that TypeScript already expanded the validator constraint and truncated that
signature before this trial. A second probe through static `Schema.fields` used
deliberately generic metadata, not the exact builder result. Both failing probe
forms were removed; no old passing assertion was relaxed. Source and rebuilt
tests now inspect captured enum fields, their exact domains and existing option
completions. The value hover is exactly `"draft" | "published"` with and without
Zod; invalid values remain rejected. The shared internal callable name/context
can appear in a method signature, but returned option aliases and domain types
stay precise. No attempt is made to reopen the retained plugin-option hover limit.

Lint initially rejected empty inherited callable interfaces and type-only test
variables; named aliases and value-level assertions corrected those failures.

### Full gate baseline

At unchanged HEAD `a5bf19f4`, the existing coverage artifact contained 729 files:
statements 23783/26074 (91.21%), branches 14704/17360 (84.70%), functions
5013/5193 (96.53%), lines 23059/25128 (91.76%). It was copied before rerunning
coverage; this is the preceding verified artifact, not a fresh second baseline
validation. Coverage exclusions, thresholds and worker bounds are unchanged.
The final results and audit are recorded below.

The first `yarn validate:full` attempt passed format, typecheck and all
560 files / 2687 tests, then stopped at lint: the subsequently added Zod
comparison fixture used one value only as a type and had an unnecessary
assertion. Both are corrected without changing production code or assertions.
Focused lint was rerun on every final changed TypeScript file, including
prototypes, before restarting the full gate; the interrupted attempt is not
a full pass.

## Final validation and audit

- `yarn validate:full`: **passed, exit 0**, with infrastructure permissions from
  launch. Format, root typecheck, **560 files / 2687 tests**, sequential lint and
  build, complete source/PostgreSQL coverage (**639 files / 2951 tests**), issue
  checks (**22 tests**), dependency constraints and public docs (**66 tests**) passed.
  No failed, skipped or unavailable required check remains. Existing soft
  file-size warnings remain: 53 in Core, 29 in other packages; no new exception.
- `yarn test:e2e:built`: **passed, exit 0**, **102 files / 410 tests**, after the
  final build and with infrastructure permissions. This includes package archives,
  compiled declarations, editor probes, listeners and PostgreSQL consumers.
- Final coverage: statements **23782/26073 (91.21%)**, branches
  **14705/17361 (84.70%)**, functions **5014/5194 (96.53%)**, lines
  **23057/25126 (91.76%)**, across 731 files. Percentages are unchanged at two
  decimals; uncovered counts are identical in every metric. Comparing both JSON
  reports found no coverage regression or missing entry in any unchanged file.
- The whole diff was re-audited against all six criteria and domain invariants.
  No remaining finding: public exports and authoring form remain unchanged;
  normalized mutations retain identity/selection/include/unique-target rules;
  validate-all precedes publication without intervening author callbacks;
  enum overloads preserve defaults, lists, immutability and plugin options;
  filter restrictions and the sole retained Typegen graph remain unchanged.
- Production: **+262 / -336 = -74**. Core moves from **370 files / 70257 lines**
  to **372 files / 70183 lines**, excluding tests, declarations and test-support.
  Tests: **+284 / -94 = +190**; fixture indentation contributes to the gross diff.
  Documentation: **+181 / -11 = +170**, including issue and checkpoint evidence.
- Assessment: a modest size gain, with five fewer hydration sites, one fewer
  compatibility-validation pass and fewer duplicated enum/filter facts. No claim
  of measured runtime/editor speedup, no new dependency, no lost functional power.
  Broader QueryBuilder/model-handle changes are outside this bounded issue.
  Full gate and compiled consumers are green before the dedicated local commit;
  push remains subject to explicit user authorization.
