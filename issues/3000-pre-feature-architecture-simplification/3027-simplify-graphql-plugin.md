# 3027: Simplify the GraphQL plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 3026
- ADR: retained GraphQL and canonical transport-projection decisions

## Goal

Simplify network-independent GraphQL compilation and execution around the
canonical Core projections without weakening schema or request safety.

## Acceptance criteria

- [ ] Baseline generated schema, custom composition, queries, mutations,
      relations, virtual fields, plugin operations, schema mutations, codecs,
      limits, cursors, errors, exports, and tests.
- [ ] Remove duplicate transport planners, binding registries, schema facts,
      type builders, validation passes, and late lookup made obsolete by issue 3012.
- [ ] Preserve SDL, field names, inputs, outputs, selection and inclusion,
      pagination, signed cursor semantics, custom schema composition, context
      validation, safe errors, limits, direct execution, and authorization
      neutrality.
- [ ] Preserve Password Auth, Soft Delete, custom fields, nested writes,
      contextual relations, virtual results, and Master-only exclusion without
      importing their packages.
- [ ] Keep GraphQL network-independent and free from Yoga, HTTP, REST, and
      database ownership.
- [ ] Change no public behavior, configuration, export, schema, cursor, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected GraphQL pages and guides under
      `apps/website/content/docs` and, when required, update them, runnable
      examples, and the package README in the same audited issue.

## Tests

- [ ] SDL snapshots, source and packed types, JavaScript, direct execution,
      custom composition, limits, cursors, operations, mutations, relations,
      virtual fields, policy, safe errors, and PostgreSQL suites pass with
      unchanged coverage evidence.

## Audit gate

- [ ] Audit every generated and custom field back to one retained contract and
      check for schema drift, authority leaks, duplicate facts, stale builders,
      and product coupling. Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Subscriptions, federation, new schema fields, or cursor redesign.
