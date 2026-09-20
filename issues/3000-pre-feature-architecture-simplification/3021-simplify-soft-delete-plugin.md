# 3021: Simplify the Soft Delete plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/soft-delete-plugin`
- Depends on: 3020
- ADR: retained Soft Delete and schema-mutation decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify Soft Delete on the canonical schema-mutation and persistence-plan
contracts without changing visibility, authorization, or lifecycle semantics.

## Acceptance criteria

- [ ] Baseline mode compilation, tombstone declaration, protected constraints,
      explicit mutation, delete-plan rewrite, private restore and purge, codecs,
      exports, and tests.
- [ ] Remove duplicate command metadata, schema traversal, visibility planning,
      binding, Typegen, and transport projection work replaced by the canonical
      graph.
- [ ] Preserve disabled, replace-delete, and explicit modes; protected active-row
      visibility; logical delete identity; Hooks and Access command keys;
      transaction behavior; non-disclosing targets; and private audited Master
      restore and purge.
- [ ] Keep the plugin independent from Access, Hooks, transports, PostgreSQL,
      and Core product vocabulary.
- [ ] Change no public behavior, configuration, export, route, field, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected Soft Delete pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [ ] Direct TypeScript, JavaScript, packed types, Access, Hooks, relations,
      rollback, cancellation, REST, GraphQL, Yoga, Master, and PostgreSQL suites
      pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for visibility leaks, product coupling, changed logical identity,
      duplicate planners, authority escape, and unnecessary abstractions.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding deletion timestamps, deleted reads, or user-authorized restoration.
