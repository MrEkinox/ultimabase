# ADR-0208: Plugin powers report only enforceable boundaries

- Status: accepted
- Date: 2026-08-20
- Refines: ADR-0186, ADR-0191, ADR-0193, ADR-0198, ADR-0206
- Depends on: ADR-0186, ADR-0191, ADR-0193, ADR-0198, ADR-0206

## Context

ADR-0191 separated Core-enforceable privileges from informational direct-host
claims, but its initial closed vocabulary anticipated filesystem, network, and
Typegen replacement facades that were never implemented. A manifest can request
`filesystem:read`, `filesystem:write`, `network:access`, or `typegen:replace`,
and startup policy can deny the request, yet no current Core operation requires
any of them. Reporting those names as enforceable would overstate the kernel.

The official Typegen package directly reads and writes files. The official
PostgreSQL package opens or drives network-backed pools. Neither behavior runs
through a Core-owned host facade, and trusted in-process JavaScript cannot be
forced to declare it. The existing environment claims are the accurate review
mechanism for those effects.

Policy denials also identify an owner and a requested name but omit the request
reason, review severity, and the phase prevented by the denial. Environment
claims previously had neither stable reason metadata nor severity.

## Decision

### Remove vocabulary without an enforceable consumer

Core removes these privileges from `PluginPrivilege` and its metadata:

- `filesystem:read`;
- `filesystem:write`;
- `network:access`;
- `typegen:replace`.

Direct filesystem and network behavior uses `environment:filesystem` and
`environment:network`. Core does not add hypothetical host facades. Typegen
keeps its current owner-scoped `typegen:reference`, `typegen:contribute`, and
`typegen:emit` declaration boundaries; there is no replaceable Typegen engine in
the current application graph. A future facade or replacement contract requires
a refining ADR and a current consumer before adding a privilege.

### Retained privileges have concrete boundaries

The retained vocabulary maps to these current enforcement points:

| Privilege              | Core-owned facade or validation boundary                        |
| ---------------------- | --------------------------------------------------------------- |
| `schema:declare`       | Field, schema, option, and additive schema declaration sessions |
| `schema:transform`     | Provenance-checked schema transformation sessions               |
| `schema:replace`       | Exact complete schema-compiler replacement planning             |
| `model:extend`         | Application-local model-surface declaration session             |
| `query:extend`         | Application-local Query extension declaration session           |
| `operation:declare`    | Operation token and surface declaration session                 |
| `capability:decorate`  | Capability decoration planning                                  |
| `capability:replace`   | Exact capability replacement planning                           |
| `runtime:observe`      | Authorized Runtime observer provider                            |
| `runtime:intercept`    | Authorized Runtime interceptor or behavior provider             |
| `runtime:constrain`    | Authorized protected Runtime constraint provider                |
| `runtime:replace`      | Complete Runtime executor replacement planning                  |
| `persistence:rewrite`  | Exact persistence-plan rewriter provider                        |
| `adapter:consume`      | Adapter capability, contribution, and compiler consumption      |
| `adapter:raw`          | Revocable adapter-specific raw lease                            |
| `migration:contribute` | Attributed adapter migration-intent contribution                |
| `transport:expose`     | Public operation transport binding                              |
| `event:publish`        | Core-bound application-factory assertion before event enqueue   |
| `typegen:reference`    | Public Typegen reference declaration session                    |
| `typegen:contribute`   | Structured main-declaration contribution session                |
| `typegen:emit`         | Structured declaration or inert metadata output session         |
| `authority:elevate`    | Application-owned audited Master elevation boundary             |

Missing privilege requests fail at the named facade or graph validation before
their effect. A configured denial fails even earlier, before static plugin
declaration. Conditional privileges remain inactive and harmless when their
exact optional capability is absent.

### Official direct-environment audit

Every current official plugin definition has this deliberate claim set:

| Plugin                         | Direct behavior claim    | Audit result                                                        |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------- |
| `@ultimabase/typegen`          | `environment:filesystem` | Loads application sources and atomically writes generated artifacts |
| `@ultimabase/postgres-plugin`  | `environment:network`    | Creates or drives PostgreSQL pools and connections                  |
| `@ultimabase/access-plugin`    | none                     | In-memory compilation and request execution only                    |
| `@ultimabase/hooks-plugin`     | none                     | In-memory callback execution only                                   |
| `ultimabase.acl`               | none                     | Uses Core Runtime and adapter capabilities; no direct host I/O      |
| `ultimabase.roles`             | none                     | Uses Core Runtime and adapter capabilities; no direct host I/O      |
| `@ultimabase/pg-vector-plugin` | none                     | Declares and validates logical values only                          |

The PostgreSQL driver's current JavaScript path does not load `pg-native`, and
none of the audited packages spawns subprocesses. Claims describe the package's
own direct behavior, not transitive application behavior or effects performed
by a capability owner.

### Denials carry one consistent review record

Environment-claim metadata assigns a stable generic reason and severity to each
closed claim. `environment:native-code` is critical; filesystem, network, and
process claims are sensitive.

Every startup denial records the structured plugin identity, formatted identity,
name, reason, severity, and `before-static-declaration` blocked phase. Privilege
reasons come from the plugin manifest; environment reasons come from the closed
claim metadata. Effect-time Core-facade privilege failures retain the same owner,
reason, and severity fields and use the `core-facade` blocked phase.

## Consequences

- Policy and autocomplete no longer present powers that a plugin cannot use.
- Typegen and PostgreSQL are visibly denyable by their actual direct-host claims.
- Plugins without direct filesystem, network, process, or native-code behavior
  retain an exact empty claim list in official conformance tests.
- Claims remain inspection and startup policy, not an operating-system sandbox.
- Source, conformance, and packed-package tests protect the final vocabulary,
  official claims, and denial diagnostics.

## Non-goals

- Intercepting arbitrary Node.js filesystem, network, process, or native calls.
- Adding unused host facades to preserve a historical privilege name.
- Making environmental claims conditional on Runtime configuration.
- Introducing a Typegen Runtime or executable generated client.
