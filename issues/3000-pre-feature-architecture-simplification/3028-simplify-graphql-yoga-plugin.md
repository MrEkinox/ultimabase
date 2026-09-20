# 3028: Simplify the GraphQL Yoga plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/graphql-yoga-plugin`, `@ultimabase/graphql-http`
- Depends on: 3027
- ADR: retained GraphQL-over-HTTP decisions

## Goal

Reduce Yoga to the smallest secure adapter between the retained HTTP and
network-independent GraphQL capabilities.

## Acceptance criteria

- [ ] Baseline endpoint discovery, route mounting, content handling, body
      limits, introspection, context handoff, errors, exports, and tests.
- [ ] Remove duplicate request parsing, endpoint facts, context validation,
      lifecycle, and execution wrappers already owned by HTTP or GraphQL.
- [ ] Preserve the configured path, POST JSON contract, body limits, rejection
      of unsupported features, introspection policy, HTTP-selected context,
      cancellation, safe errors, and exact networkless execution parity.
- [ ] Keep Yoga from owning authentication, authorization, schema generation,
      sockets, or application selection.
- [ ] Change no public behavior, configuration, export, route, payload, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected GraphQL HTTP pages under `apps/website/content/docs`
      and, when required, update them and the package READMEs in the same audited
      issue.

## Tests

- [ ] HTTP integration, content types, limits, introspection, contexts,
      cancellation, errors, source and packed, JavaScript, browser, and network
      E2E suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for context or authority forgery, duplicated parsing, endpoint
      drift, sibling ownership leaks, unsupported behavior, and resource leaks.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Subscriptions, uploads, batching, SSE, or another GraphQL HTTP adapter.
