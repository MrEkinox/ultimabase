# 6205: Converge PostgreSQL mutation planning

- Status: completed
- Milestone: 62
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 6204
- ADR: none

## Goal

Remove duplicated PostgreSQL mutation planning or execution paths only where one
package-private representation can preserve their exact transaction, lock,
constraint, and result semantics.

## Acceptance criteria

- [x] Direct, prepared, and persistence-plan mutation paths are mapped before editing.
- [x] Any retained convergence produces a net production reduction and has at least two current consumers.
- [x] Runtime security phases, lock timing, adapter constraints, atomic deltas, and transaction ownership remain unchanged.
- [x] No PostgreSQL type or plan becomes a new public Core contract.
- [x] Existing PostgreSQL performance measurements do not regress.
- [x] Documentation impact is recorded.

## Tests

- [x] Focused direct and prepared mutation parity.
- [x] PostgreSQL E2E and performance suites.
- [x] Complete debt-refactor validation gate.

## Out of scope

- Merging logical Runtime phases.
- Replacing Drizzle.
- Migration support.

## Audit before implementation

| Path                      | Current role                                                                                                                              | Convergence boundary                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Direct adapter mutation   | Keeps direct create and targeted update/delete adapter behavior in one statement; direct upsert is intentionally unsupported              | Retain its statement and constraint timing                                               |
| Prepared Runtime mutation | Locks singular/upsert targets and optional set targets before transforms, then returns private materializations from the same transaction | Retain lock timing, target handles, atomic deltas, relation writes, and result preimages |
| Persistence plan          | Converts Core's logical request plus physical plan into PostgreSQL compiler input and preserves logical delete kinds across rewrites      | Retain protocol and rewrite validation                                                   |

The direct and prepared paths already share create persistence, targeted
set-based execution, retained updates, query compilation, update compilation,
projection, and error mapping. The remaining safe duplication is the pair of
prepared create handle builders: both use the same transaction-bound handle,
constraint contract, complete-record persistence, create materialization, and
returning-plan projection. They can use one package-private cardinality-aware
builder. The lock-bearing mutation branches must remain distinct.

## Handoff

- Replaced the duplicate singular/collection prepared-create builders with one
  cardinality-aware package-private builder used by both current operations.
- Reduced production by 35 net lines (`+19/-54`) and reduced
  `prepared-operation.ts` from 530 to 495 lines without introducing another
  module, facade, public type, or Core contract.
- Kept direct mutations, prepared target locks, persistence-plan rewrites,
  relation writes, protected constraint compilation, atomic update expressions,
  error mapping, transaction ownership, materializations, and logical delete
  preimages unchanged.
- Extended the persistence-plan test to execute the same create through direct
  and prepared paths and compare both projected results and emitted SQL.
- Documentation impact: internal engineering documentation. The issue now
  records the three-path map and the proven convergence boundary; the public
  PostgreSQL contract and usage remain unchanged, so no README or website edit
  is needed.
- `yarn test:performance` passed: 2 files / 3 tests.
- `yarn validate:full` passed: 547 files / 2,595 ordinary tests; 622 files /
  2,842 coverage tests; statements 90.91% (23,707/26,075), branches 84.49%
  (14,686/17,381), functions 96.07% (5,000/5,204), lines 91.47%
  (22,995/25,137); issue metadata 1 file / 9 tests; website 17 files / 66
  tests. Lint completed with zero errors and existing line-budget warnings.
