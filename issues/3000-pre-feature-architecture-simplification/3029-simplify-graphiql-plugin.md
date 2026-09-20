# 3029: Simplify the GraphiQL plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/graphiql-plugin`
- Depends on: 3028
- ADR: retained explorer and HTTP decisions

## Goal

Keep GraphiQL as a minimal optional browser projection of one configured
GraphQL HTTP endpoint.

## Acceptance criteria

- [ ] Baseline environment gating, route contribution, endpoint discovery,
      application identity, HTML and assets, headers, claims, exports, and tests.
- [ ] Remove duplicate explorer route, endpoint, template, lifecycle, or HTTP
      adaptation made unnecessary by the retained projections.
- [ ] Preserve development defaults, explicit production opt-in, introspection
      dependency, same-origin endpoint use, application identity, absence of
      embedded credentials or authority, and environmental claims.
- [ ] Keep the package independent from Yoga and GraphQL implementation details.
- [ ] Change no public behavior, configuration, export, route, asset, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected GraphQL explorer pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [ ] Environment, route, endpoint, headers, HTML, assets, claims, source and
      packed, browser, and HTTP integration suites pass with unchanged coverage
      evidence.

## Audit gate

- [ ] Audit for credential exposure, editable foreign endpoints, production
      leakage, duplicated templates, dependency coupling, and needless code.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- New explorer features, authentication storage, or remote endpoint switching.
