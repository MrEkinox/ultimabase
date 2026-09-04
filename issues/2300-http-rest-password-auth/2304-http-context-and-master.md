# 2304: Add HTTP request contexts and Master verification

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/http-plugin`, `@ultimabase/core`
- Depends on: 2303, 2319
- ADR: ADR-0071, ADR-0113, ADR-0206, ADR-0224, ADR-0225, ADR-0226

## Goal

Create one application-bound HTTP request context, compose optional credential
resolvers, and verify an explicitly enabled application and Master key pair
without making transport structure authoritative.

## Acceptance criteria

- [ ] Every accepted request begins with the exact application selected by
      `X-UltimaBase-Application-Id` and one new anonymous Core context.
- [ ] Ordered HTTP context resolvers may validate credentials and add their own
      typed immutable values but cannot broaden Core authority.
- [ ] Initial binding, resolver execution, and final route execution use only
      the application request executor and retain exact callback attribution.
- [ ] When Master transport is enabled, only
      `X-UltimaBase-Master-Key` is passed to the selected application's
      `MasterAuthority` verification boundary.
- [ ] The HTTP plugin requests active `authority:elevate`; a denied privilege,
      absent authority, disabled boundary, invalid key, missing application ID,
      foreign key, or audit failure prevents every downstream effect.
- [ ] Successful verification creates one audited application-provenanced
      Master context while retaining safe values already derived by credential
      resolvers.
- [ ] A present invalid key never falls back to anonymous or session authority.
- [ ] Raw credentials never enter metadata, capabilities, ASTs, hooks,
      diagnostics, errors, logs, or persistence plans.
- [ ] Body fields, query parameters, alternative headers, serialized grants,
      contexts, privileges, and `useMasterKey` cannot select Master.
- [ ] Duplicate application-ID, Master, Authorization, cookie, and correlation
      headers fail from provider-preserved cardinality evidence before
      application behavior or credential verification.
- [ ] Pre-dispatch failures use only ADR-0226's safe HTTP error boundary.
- [ ] Async request storage spans resolver, handler, Runtime, transaction, and
      response completion and is isolated across applications and concurrent
      requests.
- [ ] The Fetch request signal and any configured deadline compose into the
      single request-context `AbortSignal` used by every downstream path.

## Tests

- [ ] Missing, valid, invalid, disabled, cross-application, duplicate, audited,
      audit-failure, session-plus-Master, and forged-authority matrices.
- [ ] Raw-secret absence assertions cover logs, hooks, errors, metadata, plans,
      and observer payloads.

## Out of scope

- Client keys, read-only Master keys, delegated or scoped Master grants, and
  unaudited development bypasses.
- Defining Password Auth credentials or REST routes.
