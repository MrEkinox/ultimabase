# 3002: Decide the single-active-application contract

- Status: planned
- Milestone: 30
- Packages: architecture documentation, `@ultimabase/core`, `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`
- Depends on: 3001
- ADR: new ADR superseding the affected parts of ADR-0050 and ADR-0197

## Goal

Define the smaller concurrency and lifecycle contract before changing the
application, schema-class, request-context, HTTP, or server implementation.

## Acceptance criteria

- [ ] An accepted ADR specifies one active UltimaBase application per
      JavaScript process or realm, concurrent isolated requests within it,
      sequential replacement after complete disposal, and parallel applications
      in isolated test workers or processes.
- [ ] The ADR preserves request context, transactions, cancellation, subject,
      Master provenance, and callback attribution across concurrent asynchronous
      request chains.
- [ ] Construction, initialization, start, stop, disposal, failed startup, and
      test replacement behavior are exact and contain no surviving mutable state.
- [ ] Static schema-class calls, explicit `{ ultimabase }` execution,
      application handles, model handles, and Typegen application identity have
      one unambiguous resolution rule.
- [ ] The decision resolves the fate of same-process multi-application hosting,
      shared Hono servers, application-ID routing, and multi-tenant claims
      without retaining a hidden compatibility path.
- [ ] Existing ADR history is superseded, not rewritten.
- [ ] No implementation changes in this issue.

## Tests

- [ ] ADR links, backlog metadata, formatting, and `git diff --check` pass.

## Audit gate

- [ ] Audit every current multi-application test and public claim against the
      new contract; correct the ADR and repeat until every removed guarantee and
      every retained concurrency invariant has one explicit disposition.
- [ ] Record the green audit and Documentation impact before completion.

## Out of scope

- Implementing the lifecycle or HTTP changes and simplifying unrelated plugin
  composition.
