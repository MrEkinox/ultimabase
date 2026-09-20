# 3002: Decide the single-active-application contract

- Status: completed
- Milestone: 30
- Packages: architecture documentation, `@ultimabase/core`, `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`
- Depends on: 3001
- ADR: [ADR-0258](../../docs/adr/0258-single-active-application-lifecycle.md)

## Goal

Define the smaller concurrency and lifecycle contract before changing the
application, schema-class, request-context, HTTP, or server implementation.

## Acceptance criteria

- [x] Present the exact current same-process multi-application, shared-server,
      application-ID routing, test, and public-contract behavior that would be
      removed, with the smallest alternatives and their impact, and obtain the
      user's explicit approval before accepting the ADR.
- [x] After that approval, an accepted ADR specifies one active UltimaBase application per
      JavaScript process or realm, concurrent isolated requests within it,
      sequential replacement after complete disposal, and parallel applications
      in isolated test workers or processes.
- [x] The ADR preserves request context, transactions, cancellation, subject,
      Master provenance, and callback attribution across concurrent asynchronous
      request chains.
- [x] Construction, initialization, start, stop, disposal, failed startup, and
      test replacement behavior are exact and contain no surviving mutable state.
- [x] Static schema-class calls, explicit `{ ultimabase }` execution,
      application handles, model handles, and Typegen application identity have
      one unambiguous resolution rule.
- [x] The decision resolves the fate of same-process multi-application hosting,
      shared Hono servers, application-ID routing, and multi-tenant claims
      without retaining a hidden compatibility path.
- [x] Existing ADR history is superseded, not rewritten.
- [x] No implementation changes in this issue.

## Tests

- [x] ADR links, backlog metadata, formatting, and `git diff --check` pass.

## Audit gate

- [x] Audit every current multi-application test and public claim against the
      new contract; correct the ADR and repeat until every removed guarantee and
      every retained concurrency invariant has one explicit disposition.
- [x] If a current application, public/community contract, or mandatory
      invariant needs same-process concurrency, stop and apply the architecture
      stop protocol instead of silently removing or emulating it.
- [x] Record the green audit and Documentation impact before completion.

## Out of scope

- Implementing the lifecycle or HTTP changes and simplifying unrelated plugin
  composition.

## Decision and approval

The user explicitly approved the proposed contract with “Validé” on 2026-09-20,
then confirmed separate production processes/containers and isolated parallel
test workers. [ADR-0258](../../docs/adr/0258-single-active-application-lifecycle.md)
records that D-001 exception: activation begins at initialization, replacement
requires complete disposal, HTTP identity remains, and shared Hono hosting plus
`HttpApplicationMountTable` are retired. Other capabilities remain preserved.

The [impact and audit inventory](../../docs/plans/2026-09-20-single-active-application-impact.md)
records the existing public/community contract, source consumers, test migration,
website pages, and alternatives. External community usage is unknown; the
approval explicitly accepts the documented compatibility loss and never
classifies it as unused.

## Audit loop and handoff

1. The first review identified gaps in the initial consumer list: low-level
   engines, conformance, accumulated static method names, plugin-author guidance,
   and parallel performance fixtures. It also identified a possible accidental
   change to persisted session lifetime when replacing an application.
2. The ADR and inventory now give each an explicit disposition. Static
   compilation, plugin instances, request concurrency, contexts, authority,
   callbacks, and persisted credential semantics remain protected. Initialization
   cannot be bypassed through a low-level engine; stale execution cannot bind to
   a replacement. Cleanup failure does not silently release ownership.
3. The second review corrected stale pending-decision wording in the matrix and
   made the exception explicit in the preservation contract. The final complete
   decision audit found no unresolved scope, architecture,
   security, or parity finding beyond approved D-001. Current Runtime and public
   website behavior are unchanged. Issues 3006/3007 own implementation and its
   full regression checks.

Validation: `yarn check:issues` (9 tests), formatting, all 364 local links in
the 9 changed documents, and `git diff --check` pass. No runtime/typecheck/build run is required for this
Markdown-only decision. This is a green decision audit, not proof that the
future implementation is complete.

Documentation impact: internal engineering documentation. No shipped API or
runtime behavior changes in this issue, so current package READMEs and website
pages continue to describe the implementation accurately. The inventory names
the required same-issue website updates for 3006/3007.

Scope: no implementation beyond the acceptance criteria. The user's subsequent
request for an ordinary test lifecycle helper is recorded as a proposal in
`CURRENT_PLAN.md`; it is not silently added to the accepted ADR or implemented
in this issue. No push is authorized. Continue with issue 3003 after this issue's
dedicated commit, and retain the hard stop after 3014.
