# ADR-0206: Master contexts have application-owned provenance

- Status: accepted
- Date: 2026-08-20
- Refines: ADR-0071, ADR-0186, ADR-0191, ADR-0199, ADR-0204
- Depends on: ADR-0071, ADR-0153, ADR-0186, ADR-0191, ADR-0199, ADR-0204
- Refined by: ADR-0224, ADR-0225

## Context

Core exposes `MasterAuthority` for server configuration, raw-key verification,
opaque grants, and mandatory audit. The application-owned execution shell also
offers two concise trusted paths: `RequestEngine.useMasterKey(grant, reason)`
and the server-only `useMasterKey: true` terminal option.

The current context implementation retains application ownership only when a
context has already entered an engine. `MasterAuthority.elevate()` can create a
Master context directly, including from an unbound anonymous context, while
application binding checks only the context's optional application owner. A
separately constructed authority can therefore audit and mint a real
`RequestContext` whose Master mode is accepted by an unrelated application.
Grant ownership remains correct, but the resulting authority provenance is not
checked at the operation boundary.

The open plugin kernel introduces a second ambiguity. ADR-0186 treats installed
plugins as trusted in-process Node.js code rather than sandboxed modules, while
ADR-0191 says Core-owned authority elevation is an exact critical privilege.
Official Roles and ACL maintenance currently initiate trusted terminal queries,
yet a plugin callback can request `useMasterKey: true` without declaring
`authority:elevate`. Treating every installed module as implicitly authorized
would make that privilege misleading; banning every plugin elevation would
instead require a second internal authority model for legitimate maintenance.

The framework needs one provenance and privilege rule that preserves normal
server ergonomics, existing caller-selected Master execution, application
isolation, and honest limits on what in-process privilege enforcement can claim.

## Decision

### Master provenance includes authority and application

Every Master `RequestContext` carries private unforgeable provenance containing
the exact `MasterAuthority` and `FrameworkApplication` that issued it. The
provenance is retained outside public context fields, follows immutable derived
contexts such as `withValue()`, and cannot be supplied through constructor
input, metadata, transport data, a capability value, or a structural lookalike.

Application binding accepts a Master context only when both identities exactly
match the receiving application and its configured authority. Sharing one
`MasterAuthority` object deliberately between two applications does not make a
context issued for one application valid in the other. An application without a
configured authority rejects every explicit Master context.

Anonymous contexts retain their existing ownership rule: an unbound anonymous
context may be claimed by its first application, the same application may reuse
it and its derived contexts, and another application must reject it. A Master
context is never first-bound after elevation; application ownership is
established before Core creates Master state.

### Only the application-owned shell mints Master contexts

`MasterAuthority` remains the public configuration and credential-verification
object. `authorize(rawKey)` continues to return an authority-owned opaque
`MasterKeyGrant`. Creating a Master `RequestContext` moves behind the
application-owned execution shell; direct public `MasterAuthority.elevate()`
context minting is removed.

`RequestEngine.useMasterKey(grant, reason)` verifies the grant against the
engine's configured authority, audits the elevation, and creates provenance for
that engine's exact application. The server-only terminal option
`useMasterKey: true` remains the concise trusted backend path. It uses the
configured authority's default audit identity, generates an operation-specific
reason, and creates the same provenance. Audit failure prevents context
creation and every downstream effect.

Raw credentials and grants never enter `RequestContext`, plugin inputs,
capabilities, operation ASTs, persistence plans, or transport payloads. A
Runtime replacement remains behind this same shell and cannot mint, substitute,
or rebind authority.

### Elevation and inherited caller authority are different powers

Application server code may use the two application-owned elevation paths. The
framework treats code currently executing inside an owner-attributed plugin
callback differently:

- changing an anonymous request into Master is a new elevation and requires the
  exact plugin instance to have an active `authority:elevate` privilege;
- receiving and executing an already-Master request does not require
  `authority:elevate`, because the caller selected that authority before the
  plugin ran;
- retaining Master across nested Core operations is inheritance of the active
  caller context, not a new elevation;
- requesting `useMasterKey: true` again, or using a grant to create a new Master
  engine, is a new audited elevation and requires the privilege;
- a dependency, peer, parent plugin, child plugin, capability provider, or
  previously executing owner never transfers its privilege to another owner.

Core therefore retains one owner-attributed execution scope around plugin
setup and lifecycle callbacks, application capability factories, Runtime
contributions, plugin operation handlers, and other plugin callbacks that can
reach operation execution. The elevation boundary reads the exact current
owner and checks `authority:elevate` before audit or another effect. Nested
callbacks replace the current owner with their own identity for the duration of
their execution.

Official plugins that initiate their own Master queries, including current
Roles and ACL maintenance paths, must request `authority:elevate` with a focused
reason. Merely observing or enforcing a caller's Master request does not require
the privilege. Core does not name those products or grant them an implicit
exception.

### Trust model remains explicit

Plugins remain trusted in-process Node.js code. Privilege enforcement controls
Core-owned APIs and catches accidental or policy-disallowed use while Core can
attribute execution to an exact owner. It does not claim to stop a malicious
module from using ambient Node.js powers, stealing application references, or
deliberately escaping normal framework invocation. Such isolation requires a
different process, Worker, module-loader, or operating-system boundary.

Transport input is untrusted regardless of its implementation package. It may
submit a raw credential only to an explicitly configured server verification
boundary; it cannot serialize `useMasterKey`, a grant, a context, provenance,
or plugin privilege. Successful verification still enters the owning
application shell, produces the mandatory audit event, and returns no reusable
credential material.

## Required regression matrix

| Entry path                                                                     | State                                                             | Required result                                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Direct server schema terminal                                                  | Anonymous or no active request plus `useMasterKey: true`          | One owning-authority audit, then an application-provenanced Master execution                       |
| Direct server request engine                                                   | Owning-authority grant plus non-empty reason                      | One owning-authority audit and a Master engine for the same application                            |
| Explicit anonymous context                                                     | Unbound                                                           | The selected application binds it before any optional elevation                                    |
| Explicit anonymous context                                                     | Already bound to the same application                             | Accepted with existing immutable values and source                                                 |
| Explicit anonymous context                                                     | Bound to another application                                      | Rejected before Runtime or plugin effects                                                          |
| Explicit Master context                                                        | Issued by the same application and authority                      | Accepted without changing its existing authority                                                   |
| Explicit Master context                                                        | Issued by another application sharing the authority object        | Rejected before Runtime or plugin effects                                                          |
| Explicit Master context                                                        | Issued by another or self-created authority                       | Rejected before Runtime or plugin effects                                                          |
| Explicit Master context                                                        | Missing application provenance or structurally forged             | Rejected before Runtime or plugin effects                                                          |
| Application without Master configuration                                       | Any requested elevation or explicit Master context                | `PERMISSION_DENIED` before audit or effects                                                        |
| Plugin callback without `authority:elevate`                                    | Anonymous request plus a requested elevation                      | Privilege denial before audit, nested query, adapter, or observer effects                          |
| Plugin callback with `authority:elevate`                                       | Anonymous request plus a requested elevation                      | One audit attributed to the application authority, then Master execution                           |
| Plugin callback without `authority:elevate`                                    | Caller already selected Master                                    | Existing Master execution is preserved; no new audit or elevation is manufactured                  |
| Nested callbacks from different plugins                                        | A nested owner requests elevation                                 | The exact nested owner must hold the privilege; parent and dependency privileges do not transfer   |
| Runtime replacement, interceptor, constraint, observer, or persistence rewrite | Foreign or replacement-produced context                           | Cannot replace shell context; any later explicit foreign context is rejected by provenance binding |
| Transport wire input                                                           | Master-shaped fields, `useMasterKey`, grant, or context lookalike | Rejected or ignored by the codec contract and never reaches terminal authority options             |
| Immutable context derivation                                                   | `withValue()` on anonymous or Master context                      | Retains the same application ownership and, for Master, the same authority provenance              |

Issue 1602 implements this matrix. Issue 1603 reconciles the privilege taxonomy,
official manifests, diagnostics, and environmental claims after the provenance
boundary exists.

## Consequences

- A real `RequestContext` instance is no longer sufficient evidence of Master;
  the receiving shell verifies its private issuer identities.
- Applications may deliberately share credential configuration while their
  issued contexts remain isolated.
- Server-side `useMasterKey: true` keeps its concise developer experience.
- Plugins can declare and be denied the exact critical power they use, while
  ordinary execution of caller-selected Master requests remains compatible.
- Roles and ACL manifest reports become more sensitive but more truthful.
- Removing direct public context minting from `MasterAuthority` is a deliberate
  pre-release API removal protected by source and packed negative tests.
- Core gains owner-attributed callback execution state solely to enforce its own
  privilege boundary; this state is not a public service or capability registry.

## Non-goals

- Moving Master keys, auditing, or authority modes out of Core.
- Adding `user`, `system`, plugin, or maintenance authority modes.
- Letting Access, ACL, Roles, authentication, or transports define Master
  provenance.
- Preventing a policy plugin from enforcing its declared rules on Master unless
  that contribution explicitly selects its existing `master` behavior.
- Sandboxing malicious in-process JavaScript or guaranteeing package behavior
  outside owner-attributed Core callbacks.
- Adding a general secret manager, credential exchange, or delegated-authority
  protocol.
