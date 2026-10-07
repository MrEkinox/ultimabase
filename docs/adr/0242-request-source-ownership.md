# ADR-0242: Request source names belong to their producers

- Status: accepted
- Date: 2026-09-08
- Refines: ADR-0113, ADR-0224, ADR-0238
- Depends on: ADR-0186, ADR-0190, ADR-0225

## Context

`RequestContext.source` is diagnostic provenance. It records where execution
entered an application, while authority, identity, and executable powers are
carried by separate nominal Core boundaries. Matching a source string grants
nothing.

Core historically exported `rest`, `graphql`, and `job` source constants. That
vocabulary predates the plugin-owned transport architecture. REST and GraphQL
are now optional sibling plugins, while job systems are outside Core and may be
implemented by multiple providers. Keeping their names in Core makes optional
products look foundational and creates a central registry for values whose
producers already own their meaning.

## Decision

Core exports only `requestSources.internal` for work that Core itself starts.
`BuiltInRequestSource` consequently contains only the literal `internal`.

Every plugin, transport, worker, or application that creates a request context
owns its non-empty source string. Official integrations use stable namespaced
values such as `ultimabase.rest` and `ultimabase.graphql`; community providers
may define their own values without registering them in Core. The generic
`RequestContext<TSource>` continues to preserve exact string literals for
typing and diagnostics.

Source values remain inert provenance. They never select an application,
authenticate a principal, elevate authority, grant a capability, bypass a
policy, choose a persistence path, or dispatch an operation. Those decisions
continue to require their existing nominal, application-owned contracts.

The removed Core constants receive no compatibility aliases. The framework is
pre-release, current official producers already own their strings, and aliases
would preserve the architectural coupling this decision removes.

## Consequences

- Core no longer names optional transports or hypothetical job providers.
- Adding a transport does not require a Core release or a central source-name
  registry change.
- Observability code treats source strings as producer-owned diagnostic labels,
  not as a closed authorization enum.
- Applications that used the removed convenience constants replace them with
  their own stable literal or a constant exported by the producing plugin.
