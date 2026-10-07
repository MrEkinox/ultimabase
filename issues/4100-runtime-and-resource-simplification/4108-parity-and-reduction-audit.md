# 4108: Complete parity and reduction audit

- Status: completed
- Milestone: 41
- Depends on: 4107

## Goal

Verify from baseline `38b1ca57` that the milestone improves repository-wide DX
and maintainability while preserving every supported capability.

## Acceptance criteria

- [x] Public and internal changes are enumerated.
- [x] Execution, authority, operation, Query, lifecycle, Typegen, transport,
      adapter, and test-resource parity is verified.
- [x] Production, tests, documentation, and configuration line changes are
      reported separately.
- [x] Full justified validation and issue checks are accounted for.
- [x] Remaining opportunities and rejected over-abstractions are recorded.

## Delivered changes

- Core resolves active-or-explicit application execution through one private
  selection path for single operations, batches, and schema mutations.
- Runtime operation traits share one private classification module. The final
  audit restored structural Query-carrier recognition required by logical
  schema mutations and added its missing regression test.
- Exact enumerable-key checks share one helper while preserving `Object.keys`
  ordering and symbol behavior.
- PostgreSQL test resources implement native asynchronous disposal; repository
  tests use `await using` where lexical ownership is clearer.
- Field and output builders share one private nominal captured-call primitive
  without sharing registries or public builder surfaces.
- Root and nested Query builders share one canonical clause serializer, and an
  existing `WhereBuilder` expression no longer takes an AST-to-object-to-AST
  round trip.
- PostgreSQL update/delete and singular/set-based direct writes share one
  targeted-mutation mechanic. Prepared locks, retained-target writes,
  transaction ownership, and protected constraints remain separate.

The sole public addition is standard `[Symbol.asyncDispose]()` support on
`PostgresTestWorker`; existing `dispose()` remains available. No capability,
terminal, plugin contribution, transport, adapter, Typegen output, authority
mode, or public Query form was removed or replaced.

## Line audit from `38b1ca57`

Classification is path-based: handwritten package source excluding tests is
production; test paths and `*.test.ts`/`*.test-d.ts` are tests; Markdown/MDX and
issue records are documentation; package and tool configuration is separate.

| Category      | Files | Added | Removed |  Net |
| ------------- | ----: | ----: | ------: | ---: |
| Production    |    35 |   347 |     547 | -200 |
| Tests         |    15 |   197 |      91 | +106 |
| Documentation |    12 |   520 |      33 | +487 |
| Configuration |     0 |     0 |       0 |    0 |
| Total         |    62 | 1,064 |     671 | +393 |

The repository grows only because the milestone keeps explicit issue evidence
and adds parity tests. Runtime/package production source is materially smaller.

## Validation

- `yarn typecheck`: passed.
- `yarn test`: 539 files and 2,565 tests passed; no type errors.
- `yarn lint`: passed with no errors. Existing line-budget warnings remain;
  every touched oversized production file was reduced rather than enlarged.
- `yarn build`: passed for all packages, including `publint` and `attw` checks.
- `yarn test:e2e:built`: 98 files and 387 tests passed, including PostgreSQL.
- Focused Query runtime/type/source/packed-language tests, PostgreSQL adapter
  tests, and website documentation validation also passed during their issues.

The unrestricted full test rerun was required because listener tests cannot
bind `127.0.0.1` inside the filesystem sandbox. Its first run also exposed the
logical schema-mutation Query-carrier regression; the focused reproduction,
fix, regression test, rebuilt package, full unit suite, and E2E suite all pass.

## Deliberate non-changes and next opportunities

The milestone did not merge prepared and direct PostgreSQL execution, widen
enumerable-key validation to symbols, add a public operation-trait registry,
change Query ASTs, or expose captured builder mechanics. Each would either
change semantics or replace concrete duplication with a broader abstraction.

The next useful reduction targets are the remaining oversized, responsibility-
dense modules: Core capability/lifecycle composition, Query filter authoring,
Runtime pipeline execution, and the PostgreSQL adapter/preparation split. They
should be handled as bounded issues that first isolate existing responsibilities
and lower total lines; moving code into facade or bridge files alone would not
meet this milestone's standard.

Documentation impact: both. Native asynchronous disposal is documented in the
testing package README and public testing guide; this audit and all other
implementation details remain internal engineering documentation.
