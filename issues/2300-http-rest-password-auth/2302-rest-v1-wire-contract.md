# 2302: Decide the experimental HTTP and REST v1 wire contract

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`, `@ultimabase/rest-plugin`, architecture documentation
- Depends on: 2301, 2321
- ADR: ADR-0226, ADR-0227, ADR-0228

## Goal

Accept one explicit experimental HTTP and REST v1 contract before route
generation or wire parsing creates a compatibility surface.

## Acceptance criteria

- [x] An accepted ADR fixes the base path, version marker, schema collection
      and item paths, HTTP verbs, and naming rules.
- [x] The contract distinguishes find, get, count, create, update, delete,
      upsert, and itemized bulk operations without ambiguous static and object
      ID paths; `first` and `exists` receive an explicit mapping or documented
      rejection.
- [x] Simple GET parameters and the complex query form map unambiguously to the
      existing Query AST, including filters, selections, inclusions, ordering,
      limits, and offsets. REST v1 exposes no cursor per ADR-0227.
- [x] Route enablement defaults and per-schema or per-operation overrides are
      explicit and remain separate from Access authorization.
- [x] Defaults distinguish application-owned from plugin-owned schemas;
      credential, session, maintenance, and other plugin storage schemas are
      never exposed accidentally.
- [x] The public application, Master, session, content-type, request-size,
      response-envelope, and error-envelope headers or fields are named.
- [x] ADR-0226's protocol-neutral pre-dispatch error envelope, status mapping,
      request-ID generation or accepted correlation input, and relationship to
      REST errors are explicit.
- [x] Duplicate application-ID, Master, Authorization, cookie, content-length,
      and correlation headers fail closed without revealing application or
      credential validity.
- [x] The provider request contract states how original sensitive-header
      cardinality is proven before Fetch normalization and how a provider that
      cannot preserve that evidence rejects unsupported input.
- [x] Single-application, multiple-application, framework-owned server, and
      externally owned server assembly have explicit ownership, mounting,
      uniqueness-validation, startup, rollback, stop, and disposal rules.
- [x] The point at which a later application conflicts with an already mounted
      application ID or browser policy is defined without mutating the running
      server into a partially registered state.
- [x] Body limits cover absent, incorrect, and chunked `Content-Length` values
      and are enforced while consuming the request stream.
- [x] Plugin operations remain private unless their owner and application
      exposure policy authorize the exact REST binding.
- [x] Dates, bigint, decimal, binary, object, pointer, relation, null, and absent
      values receive one portable JSON representation or a documented rejection.
- [x] The contract deliberately states where UltimaBase differs from Parse and
      promises no accidental Parse compatibility.
- [x] Realistic curl, Fetch, and TypeScript examples are reviewed before the ADR
      becomes accepted.

## Tests

- [x] `yarn check:issues` and `yarn format:check` pass for the decision change.

## Out of scope

- Implementing the HTTP or REST packages.
- OpenAPI generation, client SDKs, uploads, realtime, administration, or
  transport-specific Access rules.
