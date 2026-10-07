# ADR-0276: UltimaBase is the sole public application owner

- Status: accepted
- Date: 2026-09-28
- Supersedes: ADR-0050's public `FrameworkApplication` construction, ADR-0076's public Runtime assembly factory, and ADR-0094's retained low-level bootstrap paths
- Refines: ADR-0065, ADR-0199, ADR-0225, ADR-0258, ADR-0267
- Approval: user authorized the complete future-complexity reduction milestone on 2026-09-28

## Context

The ordinary application API is `UltimaBase`, but Core also publicly exports
`FrameworkApplication`, `createApplication`, `FrameworkEngine`, and
`createFrameworkEngine`. `UltimaBase` exposes both its lower-level application
and its started engine. Every lifecycle or single-owner change must therefore
guard several bootstrap paths, and advanced documentation teaches developers to
leave the primary facade for plugin exports, request contexts, transactions, and
Typegen.

The repository contains 123 TypeScript files mentioning `FrameworkApplication`.
Outside Core, production use is limited to Typegen and the plugin conformance
package; product plugins do not need a second lifecycle owner. Pure static
compilation, setup-only initialization, deterministic inspection, explicit
request contexts, transactions, Master verification, and dynamic plugin lookup
are nevertheless used capabilities and must remain.

## Decision

`UltimaBase` is the sole public application owner and lifecycle object.
`FrameworkApplication` and `FrameworkEngine` become private Core mechanisms.
Their public factories, facade properties, ambient accessors, and root exports
are removed rather than retained as aliases.

`UltimaBase` owns the complete supported surface:

- `compile()` performs pure deterministic declaration and schema compilation and
  returns one immutable inspection containing schemas, plugin field contracts,
  Typegen graph, privilege report, and private-storage fingerprint;
- `initialize()` materializes application capabilities and runs plugin setup
  without connecting or starting Runtime and transports;
- `start()`, `stop()`, `dispose()`, and `Symbol.asyncDispose` own the one lifecycle;
- `withContext()`, `anonymous()`, `authorizeMasterKey()`, and
  `exposeOperations()` preserve explicit request and transport composition;
- `plugin(definition)` retains exact typed setup exports, while string or
  structured identity overloads preserve dynamic diagnostic lookup;
- `ownsSchema()`, `schema()`, and `operation()` preserve exact application-local
  identity and handles.

`RequestEngine` remains the immutable public request and transaction boundary.
It is created only by a started `UltimaBase`; direct construction stays
impossible. Its public application owner is the `UltimaBase` facade rather than
the private kernel or framework engine.

Typegen accepts an exported `UltimaBase` and consumes `compile()`. The plugin
conformance package uses fresh `UltimaBase` instances for pure compilation,
setup-only initialization, lifecycle, and Runtime checks instead of maintaining
parallel application and facade fixtures. Transports continue to use the narrow
late-bound request execution capability from ADR-0225 and receive no facade,
engine, lifecycle, adapter, or authority object.

Lifecycle promise ownership is consolidated in the private application kernel.
`UltimaBase.start()` supplies Runtime assembly to that one state machine instead
of maintaining a second startup promise and cleanup branch.

## Consequences

- There is one documented and enforceable way to construct, initialize, start,
  stop, and dispose an application.
- Typegen and plugin tests retain resource-free compilation and setup-only
  validation without presenting another application class to developers.
- Advanced request composition becomes shorter because it no longer begins with
  `.engine`; plugin access no longer begins with `.application`.
- The single-active-application guard no longer needs to defend alternative
  public construction paths.
- Existing applications must export `UltimaBase` rather than a lower-level
  `FrameworkApplication`; the project is pre-release and no compatibility alias
  is retained.

## Rejected alternatives

- Keeping deprecated aliases would preserve the duplicate bootstrap graph and
  its future maintenance cost.
- Removing pure compilation or setup-only initialization would lose Typegen and
  plugin-authoring capabilities.
- Exposing the private engine through a differently named property would change
  vocabulary without simplifying ownership.
- Giving transports `UltimaBase` would violate the narrow request capability and
  broaden their authority.
