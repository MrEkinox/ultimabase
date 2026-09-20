# 3026: Simplify the REST plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/rest-plugin`
- Depends on: 3025
- ADR: retained REST and canonical transport-projection decisions

## Goal

Simplify REST planning, decoding, and response handling around the canonical
Core projections while preserving the complete REST v1 contract.

## Acceptance criteria

- [ ] Baseline route generation, schema options, queries, mutations, plugin
      operations, schema mutations, codecs, limits, errors, envelopes, exports,
      and tests.
- [ ] Remove duplicate planners, binding comparisons, operation registries,
      schema traversals, codecs adapters, and late lookup made obsolete by issue 3012.
- [ ] Preserve current paths, methods, query and mutation inputs, pagination,
      relations, nested writes, virtual outputs, Password Auth routes, Soft
      Delete routes, safe errors, response envelopes, limits, and authorization
      neutrality.
- [ ] Keep REST independent from Hono, GraphQL, database adapters, and concrete
      product plugins.
- [ ] Change no public behavior, configuration, export, route, payload, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected REST pages and guides under
      `apps/website/content/docs` and, when required, update them, runnable
      examples, and the package README in the same audited issue.

## Tests

- [ ] Route snapshots, codecs, direct parity, JavaScript, packed packages,
      Password Auth, Soft Delete, Access, ACL, nested writes, virtual fields,
      browser, and PostgreSQL E2E pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit every route back to one canonical Core command or query and check
      for wire drift, policy bypass, duplicate planning, unsafe errors, and
      product coupling. Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- REST v2, new routes, compatibility aliases, or client generation.
