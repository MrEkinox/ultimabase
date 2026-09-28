# 6205: Converge PostgreSQL mutation planning

- Status: planned
- Milestone: 62
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 6204
- ADR: none

## Goal

Remove duplicated PostgreSQL mutation planning or execution paths only where one
package-private representation can preserve their exact transaction, lock,
constraint, and result semantics.

## Acceptance criteria

- [ ] Direct, prepared, and persistence-plan mutation paths are mapped before editing.
- [ ] Any retained convergence produces a net production reduction and has at least two current consumers.
- [ ] Runtime security phases, lock timing, adapter constraints, atomic deltas, and transaction ownership remain unchanged.
- [ ] No PostgreSQL type or plan becomes a new public Core contract.
- [ ] Existing PostgreSQL performance measurements do not regress.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Focused direct and prepared mutation parity.
- [ ] PostgreSQL E2E and performance suites.
- [ ] Complete debt-refactor validation gate.

## Out of scope

- Merging logical Runtime phases.
- Replacing Drizzle.
- Migration support.
