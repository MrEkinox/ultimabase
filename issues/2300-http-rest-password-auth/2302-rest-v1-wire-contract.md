# 2302: Decide the experimental HTTP and REST v1 wire contract

- Status: ready
- Milestone: 23
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`, `@ultimabase/rest-plugin`, architecture documentation
- Depends on: 2301, 2321
- ADR: ADR-0226 and a new REST contract ADR required

## Goal

Accept one explicit experimental HTTP and REST v1 contract before route
generation or wire parsing creates a compatibility surface.

## Acceptance criteria

- [ ] An accepted ADR fixes the base path, version marker, schema collection
      and item paths, HTTP verbs, and naming rules.
- [ ] The contract distinguishes find, get, count, create, update, delete,
      upsert, and itemized bulk operations without ambiguous static and object
      ID paths; `first` and `exists` receive an explicit mapping or documented
      rejection.
- [ ] Simple GET parameters and the complex query form map unambiguously to the
      existing Query AST, including filters, selections, inclusions, ordering,
      limits, offsets, and cursors.
- [ ] Route enablement defaults and per-schema or per-operation overrides are
      explicit and remain separate from Access authorization.
- [ ] Defaults distinguish application-owned from plugin-owned schemas;
      credential, session, maintenance, and other plugin storage schemas are
      never exposed accidentally.
- [ ] The public application, Master, session, content-type, request-size,
      response-envelope, and error-envelope headers or fields are named.
- [ ] ADR-0226's protocol-neutral pre-dispatch error envelope, status mapping,
      request-ID generation or accepted correlation input, and relationship to
      REST errors are explicit.
- [ ] Duplicate application-ID, Master, Authorization, cookie, content-length,
      and correlation headers fail closed without revealing application or
      credential validity.
- [ ] The provider request contract states how original sensitive-header
      cardinality is proven before Fetch normalization and how a provider that
      cannot preserve that evidence rejects unsupported input.
- [ ] Single-application, multiple-application, framework-owned server, and
      externally owned server assembly have explicit ownership, mounting,
      uniqueness-validation, startup, rollback, stop, and disposal rules.
- [ ] The point at which a later application conflicts with an already mounted
      application ID or browser policy is defined without mutating the running
      server into a partially registered state.
- [ ] Body limits cover absent, incorrect, and chunked `Content-Length` values
      and are enforced while consuming the request stream.
- [ ] Plugin operations remain private unless their owner and application
      exposure policy authorize the exact REST binding.
- [ ] Dates, bigint, decimal, binary, object, pointer, relation, null, and absent
      values receive one portable JSON representation or a documented rejection.
- [ ] The contract deliberately states where UltimaBase differs from Parse and
      promises no accidental Parse compatibility.
- [ ] Realistic curl, Fetch, and TypeScript examples are reviewed before the ADR
      becomes accepted.

## Tests

- [ ] `yarn check:issues` and `yarn format:check` pass for the decision change.

## Out of scope

- Implementing the HTTP or REST packages.
- OpenAPI generation, client SDKs, uploads, realtime, administration, or
  transport-specific Access rules.
