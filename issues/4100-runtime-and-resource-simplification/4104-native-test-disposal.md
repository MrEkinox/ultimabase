# 4104: Adopt native asynchronous test disposal

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 4103

## Goal

Use the native explicit-resource-management contract for ordinary application
and PostgreSQL test resources instead of repeated manual cleanup scaffolding.

## Acceptance criteria

- [x] Testing-owned asynchronous resources implement `Symbol.asyncDispose`
      through their existing `dispose()` behavior.
- [x] Straightforward lexical test lifetimes use `await using` and reduce test
      boilerplate.
- [x] Lifecycle failure, competing disposal, ordering, and cleanup-error tests
      remain explicit.
- [x] Application isolation and PostgreSQL worker cleanup order remain unchanged.
- [x] Tests decrease in lines and public testing documentation is updated.

## Outcome

`PostgresTestWorker` now implements the native `AsyncDisposable` contract by
delegating to its existing `dispose()` method. The repository-owned PostgreSQL
fixture exposes the same contract through one shared idempotent cleanup
function; pool, schema, and administrative-pool cleanup order is unchanged.

Four ordinary Core application tests and five local PostgreSQL fixture scopes
now use `await using`. Tests decrease by 5 lines overall even after adding the
new type assertion and fixture protocol. Lifecycle failure, repeated disposal,
cross-application replacement, and cleanup-error tests remain explicit because
their disposal timing is the behavior under test.

The testing package README and public application-testing guide document when
to use lexical disposal and when suite-level hooks still require explicit
ordered cleanup.

## Validation

- `yarn typecheck`
- `yarn workspace @ultimabase/testing typecheck`
- `yarn workspace @ultimabase/testing typecheck:tests`
- focused unit suite: 2 files and 7 tests passed
- focused type test: 1 file passed with no type errors
- focused ESLint passed with only two pre-existing oversized E2E test warnings
- `yarn website:validate` (17 files and 66 tests passed)
- focused Prettier check and `git diff --check`

PostgreSQL-backed E2E execution is deferred to the milestone-wide validation;
the root typecheck already covers every migrated `await using` fixture scope.

## Documentation impact

Both internal engineering and public website documentation. The public testing
package gains native resource-management typing, and the website now explains
the safe lexical and suite-owned cleanup forms.
