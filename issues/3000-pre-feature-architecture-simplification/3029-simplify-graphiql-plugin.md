# 3029: Simplify the GraphiQL plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/graphiql-plugin`
- Depends on: 3028
- ADR: retained explorer and HTTP decisions

## Goal

Keep GraphiQL as a minimal optional browser projection of one configured
GraphQL HTTP endpoint.

## Acceptance criteria

- [x] Baseline environment gating, route contribution, endpoint discovery,
      application identity, HTML and assets, headers, claims, exports, and tests.
- [x] Remove duplicate explorer route, endpoint, template, lifecycle, or HTTP
      adaptation made unnecessary by the retained projections.
- [x] Preserve development defaults, explicit production opt-in, introspection
      dependency, same-origin endpoint use, application identity, absence of
      embedded credentials or authority, and environmental claims.
- [x] Keep the package independent from Yoga and GraphQL implementation details.
- [x] Change no public behavior, configuration, export, route, asset, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected GraphQL explorer pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [x] Environment, route, endpoint, headers, HTML, assets, claims, source and
      packed, browser, and HTTP integration suites pass with unchanged coverage
      evidence.

## Audit gate

- [x] Audit for credential exposure, editable foreign endpoints, production
      leakage, duplicated templates, dependency coupling, and needless code.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- New explorer features, authentication storage, or remote endpoint switching.

## Implementation and preservation audit

The four-module baseline covers exact option validation and environment gating,
conditional manifest/claim contribution, provider-neutral endpoint discovery,
HTTP browser bootstrap, public setup exports, pinned assets, HTML escaping,
application-header injection and nonce/CSP headers.

Normalization consumes the explicit deployment environment to compute
`enabled`; the unused retained environment property is removed. The normalized
record now contains exactly the two existing public setup properties, `enabled`
and `path`, and is snapshotted directly. The attempt to inline the two plugin
returns failed the existing source type check because contextual union inference
widens optional manifest fields. The separate variables are retained unchanged;
no cast, public type change or generic workaround is introduced.

The HTML template, pinned asset URLs, nonce generation, security headers,
localStorage namespace, same-origin fetcher and protocol projection are
byte-for-byte unchanged. Production opt-in, explicit environment validation,
claim/privilege gating, browser identity and lifecycle cleanup retain their
behavior. No shared explorer framework or dependency on Yoga/GraphQL is added.

Production changes from four files / 280 lines to four / 278 (-2). All five
exports and 2,626 declaration bytes are byte-identical. B-004–B-008/B-010–B-012
and P-009–P-011/P-017/P-020/P-022/P-023 are reconciled.

Documentation impact: internal engineering documentation.
The package README and the website GraphQL explorer section were reviewed.
They already correctly describe required environment, conditional exposure,
introspection, provider discovery, fixed endpoint, identity and remote assets.
No public edit is required because every documented option and output is kept.

Validation evidence:

- All 14 final package unit/type checks pass across four files (5.37 s), with
  root typecheck, package build, ESLint and dependency constraints passing.
- All 20 source/type/HTTP integration checks pass across seven files (12.94 s).
  All four coverage maps remain: 47/49 statements, 35/36 branches and 9/9
  functions, exactly matching the full 3027 baseline. No retained covered
  location is lost. The three moved setup records were reviewed; setup retains
  its four calls. No assertion, exclusion or threshold changes.
- All 54 built integration/archive checks pass across three files (11.05 s),
  covering provider-neutral discovery, production absence, HTTP browser policy,
  foreign-route rejection, cleanup and packaged public exports. Final complete
  diff audit: green, no unresolved finding or work beyond acceptance criteria.
- All nine backlog metadata checks pass after the final issue handoff.
