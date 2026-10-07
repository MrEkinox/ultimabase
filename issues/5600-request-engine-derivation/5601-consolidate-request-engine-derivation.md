# 5601: Consolidate request-engine derivation

- Status: completed
- Milestone: 56
- Package: `@ultimabase/core`
- Depends on: 317
- ADR: ADR-0065, ADR-0068, ADR-0099

## Goal

Make one private `RequestEngine` path own every derived engine construction and
reuse the common transaction-host registration facts without changing any
execution contract.

## Acceptance criteria

- [x] Context overrides, Master elevation, explicit transactions, and schema
      mutation context derivation use one private engine factory.
- [x] Plugin-operation and schema-mutation hosts share one transaction callback
      and optional lifetime description.
- [x] Every derived engine retains its exact application, context, pipeline,
      and transaction lifetime.
- [x] Transaction nesting, cancellation, ownership, Master auditing, automatic
      mutation transactions, and private execution bridges remain unchanged.
- [x] No public export, constructor access, type, or behavior changes.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing transaction semantics, request authority, operation dispatch, or
  protected-denial translation.
- Combining plugin operations with schema mutations.
- Adding public engine cloning or context replacement APIs.

## Documentation impact

Internal engineering documentation. The milestone, issue, invariants, and line
audit are recorded here and in `CURRENT_PLAN.md`. No package README, public
website page, or ADR changes are expected because RequestEngine construction,
authority, transactions, and all public APIs remain unchanged.

## Outcome

`RequestEngine.#derive()` now creates every internal variant with one exact
framework, context, pipeline, and optional transaction lifetime. The
constructor also builds the shared transaction-host facts once before binding
the plugin-operation and schema-mutation bridges. Public construction remains
closed behind the same private key, and the two command families retain their
separate execution paths.

The audit explicitly left three tempting but invalid consolidations unchanged:
PostgreSQL request/preparation/SQL dispatch is phase-specific by architecture,
`WhereBuilder` repetition carries public editor types and documentation, and
Password Auth operation annotations are required by `isolatedDeclarations`.

## Quantitative audit

Production TypeScript adds 27 lines and removes 40, a net reduction of 13.
`request-engine.ts` falls from 531 to 518 lines. No test, public declaration,
generated artifact, package README, website page, or ADR changes.

## Validation

- Focused authority, transaction, operation, and schema-mutation validation: 5
  files, 62 tests
- `yarn workspace @ultimabase/core test`: 266 files, 1,354 tests
- `yarn workspace @ultimabase/core typecheck`
- `yarn workspace @ultimabase/core build`
- `yarn constraints`
- `yarn check:issues`
- `yarn typecheck`
- `yarn test`: 545 files, 2,582 tests, no type errors
- `yarn lint`: 0 errors; 49 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
