# 3030: Simplify the Apollo Sandbox plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/apollo-sandbox-plugin`
- Depends on: 3029
- ADR: retained explorer and HTTP decisions

## Goal

Keep Apollo Sandbox as a minimal optional browser projection of one configured
GraphQL HTTP endpoint.

## Acceptance criteria

- [x] Baseline environment gating, route contribution, endpoint discovery,
      application identity, HTML and assets, request hook, claims, exports, and
      tests.
- [x] Remove duplicate explorer route, endpoint, template, lifecycle, or HTTP
      adaptation made unnecessary by the retained projections.
- [x] Preserve development defaults, explicit production opt-in, introspection
      dependency, fixed same-origin endpoint, application identity header,
      disabled endpoint and cookie controls, absence of credentials or
      authority, and environmental claims.
- [x] Keep the package independent from Yoga and GraphQL implementation details.
- [x] Change no public behavior, configuration, export, route, asset, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected GraphQL explorer pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [x] Environment, route, endpoint, request hook, HTML, assets, claims, source
      and packed, browser, and HTTP integration suites pass with unchanged
      coverage evidence.

## Audit gate

- [x] Audit for credential exposure, editable foreign endpoints, production
      leakage, duplicated templates, dependency coupling, and needless code.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- New explorer features, authentication storage, or remote endpoint switching.

## Implementation and preservation audit

The four-module baseline covers exact environment/path validation, conditional
manifest and claims, endpoint discovery, setup exports, fixed-endpoint request
handling, pinned assets, escaping and nonce/CSP headers. Normalization now drops
the consumed deployment environment; its remaining `enabled` and `path` record
is snapshotted directly for the existing public exports. No shared explorer
framework, public type or provider dependency is introduced.

The HTML, asset URL, request hook, fixed same-origin endpoint, disabled endpoint
and cookie controls, identity injection and security headers are byte-identical.
Production opt-in and the environment/claim validation paths are unchanged.
The runtime and type assertions are all retained. Production changes from four
files / 293 lines to four / 291 (-2); all five exports and 2,730 declaration
bytes remain byte-identical. B-004–B-008/B-010–B-012 and
P-009–P-011/P-017/P-020/P-022/P-023 are reconciled.

Documentation impact: internal engineering documentation.
The package README and website GraphQL explorer section already describe the
retained environment, introspection, discovery, fixed endpoint, application
identity and remote assets accurately. No public edit is required.

Validation evidence:

- All 14 package unit/type checks pass across four files (5.34 s), followed by
  root typecheck, package build, ESLint and dependency constraints.
- All 20 scoped source/type/HTTP integration checks pass across seven files
  (12.96 s). All four coverage maps retain 47/49 statements, 35/36 branches,
  9/9 functions and 46/48 lines, identical to the full 3027 baseline. No
  retained covered location is lost; the three moved setup records retain
  their execution, including both setup calls. No threshold or exclusion changes.
- All 52 built integration/archive checks pass across three files (11.07 s).
  These exercise HTTP browser bootstrap and fixed-endpoint configuration;
  live execution of the remote CDN bundle was not tested.
- The backlog check rejected the handoff status `done`; it was corrected to
  `completed`, and all nine metadata checks pass. Final complete-diff
  audit: green, no unresolved finding and no work beyond acceptance criteria.
