# 3018: Simplify the Roles plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/roles-plugin`
- Depends on: 3017
- ADR: retained Roles decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify schema-backed Roles and membership maintenance without introducing a
parallel identity or persistence system.

## Acceptance criteria

- [ ] Baseline Role schema specialization, references, membership and hierarchy
      checks, deletion maintenance, Master elevation, exports, and tests.
- [ ] Remove duplicate schema, command, query, lifecycle, and result plumbing
      made unnecessary by the simplified Core and canonical graph.
- [ ] Preserve developer-defined fields and indexes, immutable role references,
      transitive membership, cycle handling, deletion policies, transaction
      behavior, subject contributions, optional Access and Hooks composition,
      and audited internal Master work.
- [ ] Keep Roles from granting authorization by itself or depending on a
      concrete transport.
- [ ] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [ ] Review the affected Roles pages under `apps/website/content/docs` and,
      when required, update them and the package README in the same audited
      issue.

## Tests

- [ ] Source and packed types, JavaScript, hierarchy, membership, deletion,
      transactions, Access, Hooks, authentication subjects, and PostgreSQL
      suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for authority leaks, duplicate repositories, stale memberships,
      changed cycles or deletion behavior, and speculative abstractions. Correct
      and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding organization, group, invitation, or transport features.
