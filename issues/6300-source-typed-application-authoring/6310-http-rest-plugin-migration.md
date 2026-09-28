# 6310: Migrate HTTP, Hono, and REST configured installation

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`, `@ultimabase/rest-plugin`
- Depends on: 6309
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Move the HTTP and REST stack to the configured application factory without
changing its safe dispatch boundary, application identity, protocol behavior,
or Runtime execution path.

## Acceptance criteria

- [ ] HTTP, Hono, and REST install through the same flat `UltimaBase.use()` chain with exact dependency, instance, ordering, privilege, and lifecycle behavior.
- [ ] The sole active application owns the effective browser-origin policy, application identity, raw Master-key verification, auditing, and safe pre-route error boundary.
- [ ] Infrastructure-only preflight remains the sole request that may omit application identity and invokes no application behavior.
- [ ] Hono retains one optional HTTP owner, shutdown behavior, provider options, errors, and resource disposal without a shared-server application map.
- [ ] REST preserves route coverage, normalization into the common operation/query AST, status and error mapping, selection, relations, files, authentication integration, and schema/plugin operation projection.
- [ ] Transports receive only the narrow versioned application request execution capability and never receive Core internals or manufacture authority.
- [ ] Source and packed types expose exact configured transport options and plugin operation surfaces without generated transport declarations.
- [ ] Superseded installation consumers and Typegen descriptors are removed rather than bridged per transport.
- [ ] Package READMEs, examples, initializer, and public documentation are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Existing unit, type, editor, HTTP, Hono, REST, authentication, CORS, lifecycle, source-mode, packed, and PostgreSQL E2E suites migrate without dropped assertions.
- [ ] Adversarial identity, credential, preflight, post-shutdown, and cross-application regressions.
- [ ] Locked TypeScript and Runtime performance budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every installation, capability, route, request, identity, credential, preflight, error, provider, lifecycle, and documentation contract in the HTTP/REST stack.
- [ ] Audit the complete diff for transport bypass, authority manufacture, application-map resurrection, unsafe pre-route errors, preflight behavior drift, route loss, AST divergence, resource leaks, transport-specific bridges, stale Typegen, and documentation drift.
- [ ] Record each finding and correction in the handoff; rerun affected transport/security verticals plus the complete cross-transport audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; listener permission failures must be diagnosed and successfully rerun with the required environment.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- A new HTTP framework provider or REST feature.
- Transport access to `FrameworkEngine`, application facades, adapters, or authority.
- Shared-server multi-application routing.
