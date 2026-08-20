# ADR-0207: Nested callbacks use application-bound execution attribution

- Status: accepted
- Date: 2026-08-20
- Refines: ADR-0186, ADR-0191, ADR-0199, ADR-0206
- Depends on: ADR-0186, ADR-0191, ADR-0199, ADR-0206

## Context

ADR-0206 requires Core to check `authority:elevate` against the exact plugin
instance currently initiating a new Master elevation. Direct Core invocation
boundaries such as plugin setup, capability factories, Runtime contributions,
and plugin operation handlers have one unambiguous manifest owner.

Optional vertical engines introduce a nested ownership boundary. The official
Hooks and Access plugins are ordinary application capability providers, yet the
callbacks they execute may belong either to application declarations or to a
different contributing plugin. Those engines already retain this distinction
for ordering and diagnostics. If Core attributes the complete vertical engine
call to its provider, application callbacks and contributed callbacks inherit
the provider's privileges. If Core removes attribution around the provider,
plugin callbacks become indistinguishable from trusted application code at the
authority boundary.

Core cannot import Hooks, Access, or a community engine to interpret its
product-specific callback descriptors. Conversely, an extracted engine cannot
deep-import private Core asynchronous state without violating the public kernel
and dependency rules.

## Decision

### Core owns the execution state; engines select retained provenance

Core exposes an application-bound callback executor to application capability
factories. The executor has two explicit operations:

- run an application-owned callback without an active plugin owner;
- run a plugin-owned callback under one exact installed plugin and optional
  instance identity.

The executor is created only by Core, bound to one exact
`FrameworkApplication`, and cannot be rebound or constructed from public
application input. A plugin identity is validated against that application's
resolved plugin graph before its callback begins. Unknown identities fail
before callback, audit, Runtime, or adapter effects.

The executor controls only asynchronous execution attribution. It exposes no
application object, Master authority, credential, grant, privilege decision,
Runtime service, generic registry, or capability lookup. Callback arguments and
results retain their exact synchronous or asynchronous types.

### Vertical engines must replace outer ownership for every nested callback

A vertical engine that hosts callbacks from more than one owner must retain the
origin established by its declaration and capability compilation, then invoke
each callback through the application-bound executor:

- inline schema or application declarations run as application callbacks;
- plugin capability contributions run as their exact stable plugin and
  optional instance identity;
- nested callbacks replace, rather than inherit or merge with, the outer
  provider owner for their complete asynchronous lifetime.

The official Hooks and Access engines follow this rule. Community engines use
the same public protocol and do not require a product-specific Core bridge.
Diagnostics may add local contribution names, target paths, and phases, but
those labels never influence privilege ownership.

### Direct Core-owned callback boundaries remain automatic

Core automatically opens exact plugin-owner scopes around callbacks whose
owner it already controls: setup and lifecycle hooks, application capability
factories and cleanup, capability decorators, Runtime providers and
contributions, persistence-plan rewriters, plugin operation handlers, and
operation transport codecs.

Application server terminals run without a plugin owner. When a callback scope
initiates a new Master elevation, the application shell reads the active exact
owner and checks that owner's active `authority:elevate` request before audit.
Already-Master execution is inherited without another privilege check or audit.

### This is attribution, not isolation

The executor makes ownership changes explicit and prevents accidental privilege
inheritance through normal framework invocation. As established by ADR-0186,
plugins remain trusted in-process JavaScript. A deliberately malicious plugin
could misuse an executor it receives, retain ambient references, or escape
framework invocation through Node.js APIs. Preventing that requires a process,
Worker, loader, or operating-system isolation boundary and remains out of
scope.

## Consequences

- `ApplicationCapabilityFactoryContext` gains a typed callback executor whose
  methods are useful to official and community vertical engines.
- Hooks and Access preserve their existing product-specific owner descriptors
  while delegating only asynchronous attribution to Core.
- A host plugin never lends `authority:elevate` to a nested provider, peer,
  dependency, child, or application callback.
- Core remains independent from Hooks, Access, ACL, Roles, and every concrete
  plugin.
- Tests must cover application callbacks, exact plugin instances, nested owner
  replacement, unknown owners, and asynchronous scope restoration.

## Non-goals

- Creating public Master-context constructors or delegated authority tokens.
- Letting callback labels, contribution IDs, dependency edges, or capability
  names imply a privilege.
- Inspecting arbitrary function closures to infer their package of origin.
- Sandboxing in-process plugins or making intentionally false provenance claims
  impossible for malicious code.
