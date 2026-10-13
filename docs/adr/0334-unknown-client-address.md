# ADR-0334: An unknown client address is absent, not "unknown"

- Status: accepted
- Date: 2026-10-13
- Refines: ADR-0303 (HTTP plugin), the HTTP rate limit and `trustProxy` records, the
  authentication attempt-limiting record; applies ADR-0288
- Approval: the post-documentation fix pass decided by the user on 2026-10-13; record accepted by the user on 2026-10-13

## Context

Without a socket peer (fetch-handler deployments, in-memory `fetch`) and without a usable
`X-Forwarded-For` chain, the HTTP plugin sets the client address to the string `'unknown'`. Each
plugin then treats that string as a real address:

- Authentication stores it on sessions and events, while its event JSDoc promises `null`.
- Authentication keys its per-account-and-address attempt counter on it, so every such client
  shares that counter.
- The rate limit keys every such client on one bucket.

## Decision

1. `clientAddress` in the HTTP context is `string | undefined`, and `undefined` means unknown.
   The string `'unknown'` is no longer produced.
2. Authentication maps an unknown address to `null` on sessions and events. Its attempt
   limiting then applies only the per-account limit, as it already does outside HTTP.
3. The rate limit keeps one shared bucket per limit for requests without an address. Failing
   closed is safer than skipping the limit. The HTTP plugin logs one warning per process the
   first time it sees such a request, pointing to `trustProxy` and the server provider's
   `remoteAddress`.

## Consequences

- The public type of `clientAddress` changes, along with the stored session and event
  addresses. The DX audit covers the HTTP and authentication packages.
- Tests: no-peer requests give an `undefined` address, `null` on sessions and events, account-only
  attempt limiting, the shared rate-limit bucket, and the single warning.
- The HTTP and Password Authentication pages and their READMEs explain the behaviour, and
  `examples/http` and `examples/auth` prove it.
- Documentation impact: both.
