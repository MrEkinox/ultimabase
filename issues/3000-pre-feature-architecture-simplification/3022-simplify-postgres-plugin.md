# 3022: Simplify the PostgreSQL plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 3021
- ADR: retained adapter and PostgreSQL decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify the largest infrastructure plugin while preserving the complete
logical-to-physical persistence contract and database correctness.

## Acceptance criteria

- [x] Baseline schema, field, query, relation, mutation, transaction,
      introspection, synchronization, constraint, lifecycle, export, and test
      paths against the contract matrix.
- [x] Identify and remove duplicate compilers, intermediate representations,
      statement builders, validation, mapping, and lifecycle plumbing made
      unnecessary by the simplified Core.
- [x] Preserve CRUD, bulk, upsert, numeric deltas, nested writes, relations,
      JSONB, virtual dependencies, transactions, locks, protected constraints,
      indexes, schema policies, pools, disposal, and deterministic errors.
- [x] Keep Drizzle, `pg`, SQL, and database-specific migration behavior confined
      to the PostgreSQL boundary and out of Core and transports.
- [x] Prefer focused reuse within this package over a new generic Core
      abstraction; any boundary change invokes the architecture stop protocol.
- [x] Change no public behavior, configuration, export, SQL guarantee, or error
      without explicit user approval.
- [x] Review the affected PostgreSQL pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [x] Unit, source and packed types, JavaScript, Testcontainers, constraints,
      transactions, concurrency, nested writes, relations, policies, lifecycle,
      and performance suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit query and mutation semantics, atomicity, constraint preservation,
      resource cleanup, SQL ownership, duplicate representations, and measured
      regressions. Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding a database feature, migration product, or another adapter.

## Implementation and preservation audit

The package baseline covers catalog/field/codecs, filter and relationship SQL,
prepared CRUD/bulk/upsert execution, private storage, protected constraints,
transaction and connection lifetimes, introspection and direct synchronization.
The bounded reduction concerns only execution duplication; schema preparation,
DDL, pool ownership, constraint compilers and storage formats are retained.

Three old scalar object readers (`find-many`, `find-one`, `get`) had no caller:
the adapter already routes every object read through the relational executor,
including scalar-only queries. Repository-wide call inspection and the complete
3018 coverage report confirm zero executions of all three. They and their dead
dispatch branches are removed; the non-relational executor now accepts only its
actual aggregate/mutation kinds. Dispatch examines the decoded physical operation,
the same representation already consumed by the relational reader. Core retains
its validated persistence-plan envelope and allowed rewrite families.

Singular update/delete and upsert locking shared the same full selection,
clauses, protected predicate, limit and `FOR UPDATE`. They now call one private
query-based function without adding a query, changing its order, or altering
retry/error/transaction handling. The adapter also creates the relation-predicate
closure only on the path that uses it; object reads keep their existing own
compiler. The closure constructor only captured references and initialized a
counter, so moving it removes no validation or effect.

Production source shrinks from 65 files / 10,891 lines at `56f88b28` to
65 / 10,794 (-97). The 39 exports and 15,475 declaration bytes are identical.
The 622-line operation executor is now 525 lines, removing its hard-budget
exception. Prepared operations shrink by one line and their existing central
baseline decreases to 779. No budget increases or local suppressions are added.

CRUD/bulk/upsert, numeric deltas, JSONB, pointer/relation topology, nested writes,
private storage, protected row predicates, virtual projections, locks, atomic
transactions, prepared-handle expiry, pool ownership and deterministic errors
retain their current contracts. Schema policies, indexes, orphaned structures,
physical-contribution provenance, raw capability leases and migration ownership
are unchanged. B-001–B-012 and P-004/P-008–P-017/P-020–P-023 are reconciled.
Low-level set-based operations remain: Core/adapter contracts and direct tests
still consume them. They are distinct from public itemized schema batches.

Documentation impact: internal engineering documentation.
The package README corrects stale prose about transport engine access,
automatic transactions, missing targets, target locking and the already shipped
schema policies. These describe existing accepted behavior. The owned PostgreSQL
website page already states the current lifecycle, ownership, schema policies
and framework boundary correctly; no public website change is needed.

Validation evidence:

- All 170 package unit/type tests pass across 42 files (9.42 s), followed by
  root typecheck, final package build, ESLint and dependency constraints. The
  10 existing line-budget warnings remain warnings; both reduced baselines
  match the new source lengths.
- The complete coverage run executes 2,779 tests across 607 files (451.04 s).
  Its only failure was the issue's misspelled `in progress` metadata value.
  After correction to the existing `in-progress` vocabulary, all nine backlog
  checks pass. The 2,778 other tests, type checks and coverage thresholds pass.
  No production/test change followed that coverage run.
- All 65 PostgreSQL coverage maps remain. Comparison with the full 3018 report
  finds no lost retained covered statement, branch, function or line. The 50
  edited/deleted records were reviewed separately: the three dead readers and
  switch arms were never called; the common target lock receives 384 calls
  versus the old 36 + 344, including the new Password Auth regression. Both
  absent/present target outcomes remain covered. Object-read dispatch retains
  its 587 calls; no test, threshold or exclusion is removed or weakened.
- All 66 public website checks pass across 17 files (14.94 s). Public
  declarations remain byte-identical after the final build.
- All 383 built integration checks pass across 97 files (120.56 s), including
  package archives, JavaScript, transports, PostgreSQL concurrency, locks,
  transaction rollback, nested writes, relation topology and lifecycle cleanup.
- The complete final diff audit is green after the metadata correction. No
  unresolved finding, unapproved boundary change, or work outside the original
  acceptance criteria remains. Internal runtime performance checks pass; these
  measurements do not establish a reliable speed improvement.
