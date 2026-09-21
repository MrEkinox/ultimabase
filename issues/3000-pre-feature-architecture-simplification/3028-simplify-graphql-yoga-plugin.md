# 3028: Simplify the GraphQL Yoga plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/graphql-yoga-plugin`, `@ultimabase/graphql-http`
- Depends on: 3027
- ADR: retained GraphQL-over-HTTP decisions

## Goal

Reduce Yoga to the smallest secure adapter between the retained HTTP and
network-independent GraphQL capabilities.

## Acceptance criteria

- [x] Baseline endpoint discovery, route mounting, content handling, body
      limits, introspection, context handoff, errors, exports, and tests.
- [x] Remove duplicate request parsing, endpoint facts, context validation,
      lifecycle, and execution wrappers already owned by HTTP or GraphQL.
- [x] Preserve the configured path, POST JSON contract, body limits, rejection
      of unsupported features, introspection policy, HTTP-selected context,
      cancellation, safe errors, and exact networkless execution parity.
- [x] Keep Yoga from owning authentication, authorization, schema generation,
      sockets, or application selection.
- [x] Change no public behavior, configuration, export, route, payload, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected GraphQL HTTP pages under `apps/website/content/docs`
      and, when required, update them and the package READMEs in the same audited
      issue.

## Tests

- [x] HTTP integration, content types, limits, introspection, contexts,
      cancellation, errors, source and packed, JavaScript, browser, and network
      E2E suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for context or authority forgery, duplicated parsing, endpoint
      drift, sibling ownership leaks, unsupported behavior, and resource leaks.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Subscriptions, uploads, batching, SSE, or another GraphQL HTTP adapter.

## Implementation and preservation audit

The baseline covers all eight Yoga modules and both GraphQL HTTP contract
modules: normalized options, endpoint discovery, mount/resource lifetime,
streamed body and content validation, introspection, safe errors and the exact
HTTP-selected context handoff to networkless execution.

No production reduction is retained. The mount protocol must project only
`name` and `version`; the nominal GraphQL token also carries `kind`, rejected by
the closed HTTP protocol contract. The first proposed direct-token reuse was
caught by 22 startup tests and reverted without widening HTTP. A proposed
common error construction needed additional diagnostic parameters to preserve
parse causes and validation locations; it offered no useful net simplification
and was also reverted. Final production source is byte-for-byte unchanged.

The body parser owns streamed bytes and the HTTP JSON envelope; GraphQL owns
AST/variable budgets and Runtime entry. Yoga's validation also owns the HTTP
introspection policy and HTTP error classification. These are distinct current
contracts, not redundant validation. Path validation occurs separately at
untrusted plugin options and the provider-neutral endpoint boundary, with
existing public errors; sharing it would require a new public helper or change
those errors. No such API is added. Existing resources already delegate cleanup
to Yoga and keep sockets, authority and application selection with their owners.

Yoga retains eight production files / 815 lines, four exports and 2,693
byte-identical declaration bytes. GraphQL HTTP retains two / 82 lines, three
exports and 783 identical declaration bytes. B-004–B-008/B-010–B-012 and
P-009–P-011/P-017/P-020/P-022/P-023 remain reconciled, including networkless
parity, custom endpoint discovery and independent explorer providers.

Documentation impact: internal engineering documentation.
The Yoga README's configuration sketch had no queryable schema. It now gives
a complete local, read-only Post example with the existing PostgreSQL provider,
explicit startup and disposable-database scope. The website GraphQL page
already contains this complete setup, package installation and matching HTTP
request; it is linked from the README and requires no public-contract edit.
The GraphQL HTTP README remains accurate.

Validation evidence:

- All 51 final unit/type checks pass across 11 files (7.87 s), including
  Chromium, limits, failure status/body, contexts, deadlines and cleanup.
  Root typecheck passed during the audit; final package build, ESLint and
  dependency constraints pass. No type or runtime production change remains.
- All 52 selected built integration/archive checks pass across three files
  (10.98 s), covering Yoga, provider-neutral explorers and packaged exports.
  All 66 website documentation checks pass across 17 files (11.27 s).
- The complete 3027 coverage report applies byte-for-byte to the final
  production sources and unchanged tests: all ten Yoga/GraphQL HTTP maps remain,
  with no removed branch, assertion, exclusion or threshold. The full run's
  2,779 passing tests include these exact sources and their PostgreSQL parity.
- Final complete diff audit: green. No unresolved finding, new abstraction or
  work beyond acceptance criteria. All nine backlog metadata checks pass.
