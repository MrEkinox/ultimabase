# 4403: Complete parity and DX audit

- Status: completed
- Milestone: 44
- Packages: repository
- Depends on: 4401, 4402
- ADR: ADR-0245, ADR-0259, ADR-0272

## Goal

Verify functional parity and report the cast, line, type-safety, and developer
experience impact of truthful logical Runtime typing.

## Acceptance criteria

- [x] Focused and repository-wide validation pass.
- [x] Runtime order, authority, transactions, persistence, and adapter inputs are unchanged.
- [x] Additions and removals are classified by production, tests, docs, and config.
- [x] Remaining forced casts and further debt are reviewed.
- [x] Documentation impact is recorded.

## Functional parity

Native CRUD still owns normalization, structural validation, prepared-operation
transforms, adapter execution, and database result correlation. Plugin schema
mutations retain their distinct owner resolution and physical update/delete
plan. Both paths share only the policy, behavior, result, commit, and
post-commit stages they already shared before this milestone.

No order, authority, transaction, persistence-plan, adapter, Hook, Access, ACL,
transport, or result capability was removed. ACL now reads a schema mutation's
logical update effect directly, preserving its deny-only field protection
without pretending the operation is native CRUD.

## Quantitative audit

Compared with baseline `d97afb1b`, the completed milestone changes **45 files**
with **1,102 additions and 433 deletions** (net **+669**):

| Area | Added | Removed | Net |
| --- | ---: | ---: | ---: |
| Production | 702 | 390 | +312 |
| Tests | 121 | 21 | +100 |
| Engineering and public documentation | 279 | 22 | +257 |
| Configuration | 0 | 0 | 0 |

The milestone is therefore a type-safety and DX reduction, not a source-line
reduction. The production increase is concentrated in the closed logical-stage
contracts and explicit Access/Hook boundary validation; tests and milestone
evidence account for the rest.

Across handwritten package production sources, forced `as never` and
`as unknown as` bridges fall from **168 to 138** (−30). In the exact schema
mutation, Access, Hooks, and ACL dispatch paths targeted here, they fall from
**29 to 1**. The retained double assertion is the deliberately opaque return
of `DatabaseOperationExecutor.prepare()`; it is an adapter trust boundary, not
a logical-operation bridge.

## DX assessment

The improvement is concrete: a Runtime interceptor or protected policy can
select `plugin-schema-mutation`, receive its exact logical AST in autocomplete,
and inspect its query, target, outcome, and result without coercing it to CRUD.
Official Access and Hooks now demonstrate the same discrimination pattern a
third-party engine can use. Unsupported alternative engines explicitly return
before native-only logic instead of relying on a narrower but false callback
type.

The remaining friction is the pair of generic target/outcome parameters on
prepared and materialization stages. Removing them was tested during 4402, but
TypeScript then lost the native operation-to-record correlation; keeping them
preserves stronger inference. A worthwhile next debt reduction would be one
Core-owned, runtime-validated decoder for prepared records and materialization
sources, reused by Access, Hooks, ACL, and community engines. That could remove
the new boundary-validation repetition without weakening the public contract.

## Validation

- `yarn typecheck`
- `yarn test`: 539 files, 2,569 tests, no type errors
- `yarn lint`: 0 errors; 50 pre-existing file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- Focused Runtime suite: 6 files, 30 tests
- Core compile-time suite: 67 files, 132 tests, no type errors

The first sandboxed full-test run could not bind localhost ports. The same full
suite passed outside the network sandbox; no product failure was hidden.

## Documentation impact

Internal engineering documentation. Issue 4401 already updated the Core README
and public Runtime Pipeline page for the public contract; 4403 records parity,
measurements, remaining debt, and validation evidence.
