# ADR-0241: GraphQL HTTP explorers use a provider-neutral endpoint contract

- Status: accepted
- Date: 2026-09-08
- Refines: ADR-0010, ADR-0190, ADR-0191, ADR-0224, ADR-0226, ADR-0238
- Depends on: ADR-0190, ADR-0191, ADR-0224, ADR-0226, ADR-0238

## Context

GraphiQL and Apollo Sandbox are browser applications. Their initial document
navigation cannot attach UltimaBase's canonical application-ID header, while
ADR-0224 otherwise requires that header before any application route is
selected. Treating an explorer like preflight would be incorrect because an
explorer does invoke application-owned behavior.

The explorers also need the selected application's GraphQL HTTP path. Naming
that integration after Yoga would couple developer tooling to one adapter and
would prevent a future Apollo Server or other GraphQL HTTP provider from
supplying the same contract.

## Decision

### One provider-neutral GraphQL HTTP endpoint capability

The non-plugin contract package `@ultimabase/graphql-http` owns the single,
application-lifetime `ultimabase.graphql.http-endpoint@1.0.0` capability. Its
immutable value contains only one normalized absolute `path`.

`@ultimabase/graphql-yoga-plugin` provides that capability together with its
HTTP mount. GraphiQL and Apollo Sandbox require the capability and therefore do
not import Yoga. A future GraphQL HTTP adapter may provide the same capability.
Two providers in one application conflict deterministically through `single`
cardinality; explorers never choose between them.

The package direction is:

```text
graphql-http          -> core/shared
graphql-yoga-plugin   -> graphql-http/http-plugin/graphql-plugin/plugin-kit/core/shared
graphiql-plugin       -> graphql-http/http-plugin/plugin-kit/core/shared
apollo-sandbox-plugin -> graphql-http/http-plugin/plugin-kit/core/shared
```

`graphql-plugin` remains network-independent and imports none of these HTTP or
explorer packages.

### Browser bootstrap is an exact owned HTTP endpoint kind

The HTTP plugin adds an owned `browser-bootstrap` route kind. A provider creates
one with `httpBrowserBootstrapRoute()`. It is an exact `GET` route, retains the
same plugin provenance and collision semantics as ordinary routes, and is
materialized and disposed with the application route graph.

The external browser URL is:

```text
/__ultimabase/apps/{encodeURIComponent(appId)}{routePath}
```

The `'/__ultimabase/apps'` namespace is reserved and cannot be claimed by an
ordinary route, mount, or bootstrap suffix. When the canonical application-ID
header is absent, the server mount table may use the encoded path segment only
when all of these conditions hold:

1. the request method is `GET`;
2. the path has the exact reserved shape and a non-empty application segment;
3. that segment decodes to one exact mounted public `appId`;
4. the remaining path matches an owned `browser-bootstrap` route in that
   application's compiled route graph.

Only then does the mount table rewrite the request to the application-local
route path and add the already selected public application ID as canonical
header evidence. The request continues through normal request-context,
credential, Master, timeout, owner-attribution, handler, and response-finalizing
boundaries. A malformed path, unknown application, undeclared route, duplicate
header, or explicit conflicting header receives the existing safe pre-dispatch
failure and invokes no application behavior.

This is not a second general application selector. REST, GraphQL, auth, mounts,
ordinary routes, and every non-bootstrap method remain header-only. Browser
preflight remains the sole application-free request and still invokes no
application behavior.

### Explorers are explicit, fixed, and non-secret

`graphiqlPlugin()` and `apolloSandboxPlugin()` are separate optional plugins.
Both require an explicit `environment: 'development' | 'production'`. They
contribute no route in production unless `allowInProduction: true` is also
present. They never inspect `NODE_ENV` or another process-global mode.

Each plugin contributes one configurable bootstrap suffix, defaulting to
`/graphiql` or `/apollo-sandbox`. Its document reads the public application ID
from its own browser URL and sends the canonical header to the fixed same-origin
GraphQL path received from `graphqlHttpEndpointCapability`. The documents embed
no application ID, Master key, Authorization or cookie credential, raw plugin
option, schema-private metadata, reusable authority, endpoint picker, or
application switcher.

GraphiQL uses a custom Fetch requester. Apollo Sandbox uses `handleRequest`,
sets `endpointIsEditable: false`, and hides cookie controls. Both rely on
explicit GraphQL HTTP introspection when their IDE needs schema discovery; the
explorer plugins do not silently change the adapter's introspection policy.

### Remote browser assets are bounded and reported

The explorer packages use documented versioned upstream browser assets and
declare `environment:network` so startup policy can reject that dependency.
Their HTML responses set a focused Content Security Policy, deny framing and
MIME sniffing, use a restrictive referrer policy, and inherit HTTP's mandatory
`private, no-store` cache boundary. Inline bootstrap code receives a fresh CSP
nonce. No remote asset URL or browser message may alter the fixed GraphQL
endpoint or canonical application header.

## Consequences

- Explorer tooling can work with Yoga now and another GraphQL HTTP adapter
  later without a provider-specific capability or dependency.
- One narrow path carrier makes direct browser navigation possible without
  weakening ordinary application selection.
- Installing GraphQL or Yoga adds no UI, and production exposure remains an
  explicit per-explorer decision.
- Applications that deny the network environmental claim reject these remote
  asset explorers before routes materialize.

## Non-goals

- A generic explorer-provider switcher or web asset framework.
- Automatic introspection, authentication UI, schema registry integration,
  subscriptions, endpoint enumeration, or cross-application navigation.
- Allowing the reserved URL selector for application APIs or arbitrary routes.
