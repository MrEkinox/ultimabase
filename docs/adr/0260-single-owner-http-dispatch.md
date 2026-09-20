# ADR-0260: Single-owner HTTP dispatch

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0258 and ADR-0226
- Implementation: issue 3007

## Context and approval

ADR-0258 removes the multi-application HTTP mount table. That table also owns
the safe absent-application response, needed while an externally owned Hono
listener remains open after UltimaBase stops. The application fetch boundary
cannot represent an absent owner. Copying HTTP header and correlation
validation into Hono would split the security boundary.

The user explicitly approved the minimal replacement after the issue 3007
architecture stop. No other new public abstraction is authorized by this record.

## Decision

Export `dispatchHttpApplicationRequest(application, input)` from the HTTP plugin.
The first argument is `HttpApplication | undefined`; the second remains
`HttpServerRequest`. A present owner delegates to its existing fetch boundary.
An absent owner validates original-header evidence and correlation through the
existing private HTTP helpers, then returns HTTP_APPLICATION_REJECTED.
Malformed evidence still returns HTTP_BAD_REQUEST. Privacy headers, request-ID
handling and safe internal errors retain their existing contract.

Move exact browser-bootstrap ownership and path rewriting into the application's
own fetch boundary. Keep the encoded URL, GET-only exception, matching owned
route, and complete context, credential, deadline and response pipeline.
Remove the mount table, its configuration-only HttpServerProviderCompatibility
type, and private prepared-dispatch bridge. Preserve the consumed
HttpServerOwnership type and protocol validation in the existing capability.

Hono keeps one owner and rejects a competing owner before changing listener or
browser policy. It stops accepting new requests before graceful shutdown and
releases ownership after successful cleanup. An old owner's later teardown
cannot change a replacement. External listeners and ordinary Hono routes
remain externally owned. Reusing a provider across sequential application
lifetimes is retained; Core still prohibits restarting a stopped application.

No application registry, multi-application router, compatibility mode, new
capability, Core HTTP dependency, or change to REST/GraphQL resource semantics
is introduced. Existing public client identity and credential rules remain.

## Validation and documentation

Test the direct HTTP boundary, missing-owner dispatch, duplicate original
headers, exact bootstrap ownership, malformed identity, protocol compatibility,
listener cleanup, sequential replacement, stale disposal, CORS and unchanged
REST/GraphQL/session/Master integrations. Audit removed exports in source and
compiled package tests. Update the HTTP and Hono READMEs and website pages in
the implementation issue.
