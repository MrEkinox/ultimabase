# 1210: Decompose native Access dispatch responsibilities

- Status: completed
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1209
- ADR: ADR-0116, ADR-0120, ADR-0167 through ADR-0171

## Goal

Separate native operation/filter decisions, mutation-field transitions, item
checks, and output restrictions while retaining one policy-neutral native
Access runtime.

## Acceptance criteria

- [x] Operation and filter rule evaluation has focused internal ownership.
- [x] Create fills, update replacements, clears, field references, and relation writes share focused mutation-transition ownership.
- [x] Item checks and final output/selection restrictions have focused internal ownership.
- [x] `NativeAccessRuntime` owns composition and application-local state instead of every low-level algorithm.
- [x] Master bypass, deny semantics, target-aware re-evaluation, monotonic filters, field restrictions, and hidden cardinality remain unchanged.
- [x] Runtime does not gain ACL, role, authentication, permission-provider, or neutral placeholder behavior.
- [x] No file in `acl-permissions-plugin`, `acl-postgres-plugin`, or `roles-plugin` is changed by this issue.
- [x] Remaining assertions at generic operation boundaries are documented and protected; touched production assertion counts do not increase.

## Tests

- [x] Focused suites cover operation, filter, item, field transition, output, master, and malformed-boundary behavior.
- [x] Existing native Access, Runtime, hook, relation, and PostgreSQL Access tests pass.
- [x] Core public exports and declarations remain unchanged.

## Validation evidence

- `NativeAccessRuntime` is reduced from 1,563 lines of mixed algorithms to a
  228-line composition boundary that owns the application-local Access plan,
  hook execution runtime, schema-plan lookup, and established evaluation order.
- `rule-evaluation.ts` owns operation decisions, monotonic filters, rule
  invocation, master bypass, stable denials, and query field references.
  `mutation-transitions.ts` owns create fills, replacements, clears, relation
  writes, update candidates, and initial mutation-field checks.
- `item-access.ts` owns create, prepared target, collection preimage, and
  database-selected upsert checks. `output-access.ts` owns selection narrowing,
  explicit selection denial, final omission, pointer metadata, and hidden
  collection cardinality. `field-paths.ts` shares exact field-path identity.
- Native rule evaluation still uses the common callback execution boundary and
  now rejects malformed JavaScript decision results with a focused regression.
  Master bypass remains limited to plugin rules that declare it; deny defaults,
  target-aware re-evaluation, and monotonic filter combination are unchanged.
- No ACL permission, ACL PostgreSQL, role, authentication, provider, stage, or
  bypass behavior was added or changed. The ACL and role package sources are
  untouched by this issue.
- The touched production assertion count remains eleven. Every erased operation
  or result boundary now documents the validation, materialization, container,
  or cardinality invariant restored by the assertion.
- Focused Runtime and Access validation passes with 8 files and 74 tests. The
  broader native Access, Runtime, hook, relation, PostgreSQL Access, ACL, and
  role matrix passes with 48 files and 295 tests.
- Repository validation passes with 286 files and 1,813 tests, including
  compile-time checks. Constraints, typecheck, lint, formatting, build, and
  Changesets validation pass.
- Packed-package validation passes with 7 files and 47 tests. A packed Core
  declaration regression proves the extracted Access implementation names do
  not become public exports.

## Out of scope

- ACL hardening issues 432 through 435.
- Field Access sibling dependencies from issue 439.
- New Access declarations, provider contracts, or bypass modes.
