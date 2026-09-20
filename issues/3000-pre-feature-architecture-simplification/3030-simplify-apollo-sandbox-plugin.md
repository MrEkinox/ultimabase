# 3030: Simplify the Apollo Sandbox plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/apollo-sandbox-plugin`
- Depends on: 3029
- ADR: retained explorer and HTTP decisions

## Goal

Keep Apollo Sandbox as a minimal optional browser projection of one configured
GraphQL HTTP endpoint.

## Acceptance criteria

- [ ] Baseline environment gating, route contribution, endpoint discovery,
      application identity, HTML and assets, request hook, claims, exports, and
      tests.
- [ ] Remove duplicate explorer route, endpoint, template, lifecycle, or HTTP
      adaptation made unnecessary by the retained projections.
- [ ] Preserve development defaults, explicit production opt-in, introspection
      dependency, fixed same-origin endpoint, application identity header,
      disabled endpoint and cookie controls, absence of credentials or
      authority, and environmental claims.
- [ ] Keep the package independent from Yoga and GraphQL implementation details.
- [ ] Change no public behavior, configuration, export, route, asset, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected GraphQL explorer pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [ ] Environment, route, endpoint, request hook, HTML, assets, claims, source
      and packed, browser, and HTTP integration suites pass with unchanged
      coverage evidence.

## Audit gate

- [ ] Audit for credential exposure, editable foreign endpoints, production
      leakage, duplicated templates, dependency coupling, and needless code.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- New explorer features, authentication storage, or remote endpoint switching.
