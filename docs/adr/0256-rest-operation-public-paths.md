# ADR-0256: Short public paths for REST application operations

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0228, ADR-0233, ADR-0235
- Uses: ADR-0240's existing operation transport planner

## Context

The user approved replacing Password Auth's namespaced REST operation URLs
with `/api/v1/auth/sign-up`, `/login`, `/refresh`, and `/logout` under the same
auth prefix. Like Soft Delete's schema mutation paths, these URLs should show
the public action rather than the internal namespaced operation identifier.

## Decision

REST application-operation binding metadata accepts exactly `errors` and an
optional `path`. A path starts with `/` and contains non-empty segments of ASCII
letters, digits, underscores, or hyphens. It is relative to the configured
versioned REST root. It accepts no parameters, encoded characters, dot segments,
query, fragment, or trailing slash. The `classes` and `operations` roots remain
reserved so application operations cannot shadow generated schema routes or the
default namespaced operation namespace.

Without a path, the existing `/operations/{namespacedOperation}` route remains
canonical. With a path, only the short URL is generated. Existing route-graph
collision checks apply across operations and REST instances before startup.
Different configured base paths may expose the same operation independently.

REST consumes the existing Core operation planner during materialization to
read the selected operations' inert bindings. The complete error-status mapping
is checked during route compilation and again at execution binding. Core gains
no new API or knowledge of paths. REST does not depend on Password Auth, and
Password Auth continues to declare the canonical REST protocol through Core.
Schema mutation bindings retain their separate error-only metadata contract.

Password Auth declares `/auth/sign-up`, `/auth/login`, `/auth/refresh`, and
`/auth/logout`. The old namespaced URLs are removed without compatibility aliases.
The exact-token allowlist, operation identities, POST method, input envelope,
results, error statuses, request identity, and Runtime execution stay unchanged.
The separate secure-cookie `/auth/v1/...` endpoints and GraphQL are unchanged.

## Scope

This adds one static presentation field to an existing REST binding, not a new
router or public route configuration API. It adds no automatic operation
exposure, dynamic path captures, alternate HTTP methods, redirects, or Core
changes. Soft Delete continues to use its schema-local mutation contract.

## Verification

Test canonical path validation, preserved default routes, explicit exposure,
collision rejection, distinct REST prefixes, HTTP dispatch and public errors,
Password Auth session transitions, and 404 responses for the removed URLs.
