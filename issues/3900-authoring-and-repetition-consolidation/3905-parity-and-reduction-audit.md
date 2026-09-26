# 3905: Complete parity and reduction audit

- Status: completed
- Milestone: 39
- Depends on: 3904

## Goal

Verify from baseline `776b533c` that the milestone reduced production and test
duplication, improved plugin authoring, and retained every supported functional
capability.

## Acceptance criteria

- [x] Public authoring replacements and removed names are enumerated.
- [x] Current repository callers use only the canonical field-family path.
- [x] Runtime, Typegen, GraphQL, ownership, instance isolation, and mutation
      behavior remain covered.
- [x] Production, test, documentation, and configuration line changes are
      reported separately.
- [x] Full typecheck, tests, coverage, lint, build, website, and issue checks are
      accounted for.
- [x] Remaining opportunities and rejected over-abstractions are recorded.

## Public authoring result

The milestone intentionally replaces the parallel public factories
`definePluginFieldType()` and `defineFieldBuilderMethod()`, plus Plugin Kit's
`definePluginFieldBuilderMethod()` alias, with Core's single
`definePluginFieldFamily()`. The declaration facade similarly replaces the
separate type and method registration operations with `fields.register()`.

This is a shape migration, not a capability removal. A field family still
supports:

- a Typegen value contract without exposing a builder method;
- any non-empty subset of stored, embedded, virtual, and output contexts;
- distinct factory and method types for each context;
- context-specific field-kind and Typegen overrides;
- application-local ownership, atomic registration, duplicate rejection, and
  deterministic Runtime and Typegen inspection.

ACL, pg-vector, Typegen fixtures, GraphQL fixtures, Core tests, examples, and
public documentation all use the canonical form. A repository-wide search finds
no remaining use of the removed factories or registration methods.

## Functional parity

- Source and packed-package language-service tests retain exact inference and
  editor hover names.
- Plugin fields with and without builders retain Runtime and Typegen output.
- GraphQL retains every scalar representation, UUID system-ID behavior, pointer
  input IDs, enum/object handling, and unsupported-kind rejection.
- Capability readers, setup contexts, contribution IDs, and private storage
  retain exact plugin-instance isolation without serialized identity keys.
- Access, Hooks, REST, and GraphQL prepared-mutation suites retain their product
  records, effects, transactions, traces, and assertions behind one test-only
  adapter fixture.
- No nested plugin path, alternate registry, new public bridge, Runtime
  behavior, package dependency, or functional option was added.

The audit added one direct pointer-to-`GraphQLID` assertion after coverage
showed that the preserved special-case branch was exercised only indirectly.

## Reduction

Before this audit record itself, the complete change set contains 1,882 added
and 1,925 deleted lines, a net reduction of 43 lines. Its categories are:

| Category                          | Added | Deleted |  Net |
| --------------------------------- | ----: | ------: | ---: |
| Handwritten production TypeScript |   523 |     738 | -215 |
| Tests and test-only support       |   906 |   1,099 | -193 |
| Documentation and issue tracking  |   443 |      80 | +363 |
| Configuration                     |    10 |       8 |   +2 |

The four implementation commits alone contain 1,868 additions and 1,925
deletions, a net reduction of 57 lines. The larger addition counts come from
replacement tests, ADR-0273, public migration documentation, and per-issue
evidence rather than a production bridge.

The main concrete reductions are 215 production lines, 124 fixture-support
lines after introducing the shared test adapter, 104 GraphQL production lines,
88 field-authoring production lines, and 23 structured-identity production
lines.

## Validation

- `yarn typecheck` passed.
- `yarn test` passed: 536 files and 2,554 tests, with no type errors.
- `yarn test:coverage` passed after the final audit assertion: 611 files and
  2,802 tests, with 90.54% statements, 83.96% branches, 95.88% functions, and
  91.15% lines.
- `yarn lint` passed with only pre-existing line-budget warnings.
- `yarn build` passed, including package export validation.
- `yarn website:validate` passed during the public field-family migration.
- `yarn check:issues` passed after every completed issue.

Coverage retains every suite and assertion family. Percentages differ slightly
from the intermediate issue-3902 snapshot because the later production
refactors changed the instrumented statement and branch sets; the new identity
map is fully covered and the uncovered pointer special case found by the audit
now has a direct regression assertion.

## Assessment and next opportunities

The objective is met. A plugin author now declares one field family and calls
one registration method instead of coordinating separate field-type and builder
concepts. Internally, GraphQL and structured plugin identity also have one
source of truth, while repeated mutation test infrastructure is smaller and no
longer counted as production.

The next safe target is the large `SchemaDeclarationRegistry`: extract its pure
input normalization and snapshot functions while retaining its single existing
transactional registration path. The declaration host's repeated privilege
activation checks can also become one private predicate. Both should be proven
as separate issues with net production reduction.

Do not yet generalize field, schema, and private-storage declaration sessions
behind one generic registry abstraction. Their privileges, staging semantics,
commit behavior, and diagnostics differ; a generic facade would currently move
complexity into a bridge instead of removing it.

## Documentation impact

Both. ADR-0273, Core and Plugin Kit READMEs, the schema example, and the public
plugin authoring guide document the canonical field-family API. The milestone
issues and `CURRENT_PLAN.md` record internal consolidation and validation.
