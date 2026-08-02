# ADR-0090: Permission plugins contribute monotonic hooks

- Status: accepted
- Date: 2026-08-01
- Supersedes: the named permission-stage structure from ADR-0064 and ADR-0076
- Refines: ADR-0006, ADR-0015, ADR-0068, ADR-0070, ADR-0089
- Refined by: ADR-0102, ADR-0103

ADR-0095 later consolidated the neutral Access contracts and Runtime into
`@ultimabase/core`. References below to the former `@ultimabase/access` package
describe the same internal Access domain and its current Core exports.

## Context

Runtime currently names `clp`, `acl`, and `fieldPermissions` as mandatory
pipeline stages. Application assembly installs neutral implementations when the
matching plugin is absent and grants one plugin exclusive ownership of each
position.

That structure makes optional permission plugins part of Runtime's vocabulary.
It also creates a second extension mechanism beside the native schema and field
hooks selected by ADR-0089. A new community policy would either need a new
Runtime stage or would receive weaker guarantees than the official permission
plugins.

CLP, ACL, and field permissions are optional plugins. Runtime must execute their
behavior safely when installed without importing, naming, configuring, or
bypassing those capabilities itself.

## Decision

### Runtime remains policy-neutral

Runtime owns request execution, native hooks, transaction boundaries, and a
generic adapter-constraint envelope. It does not expose pipeline discriminants,
constructor properties, neutral handlers, exclusive slots, or bypass branches
named after CLP, ACL, field permissions, roles, or another policy plugin.

The fundamental request authority remains `anonymous`, `user`, or `master`.
Runtime transports that trusted context but does not decide which installed
policy a master request bypasses. Each policy plugin owns that decision and may
reuse neutral helpers from `@ultimabase/access`.

Runtime may continue importing the neutral request-authority and capability
contracts from `@ultimabase/access`; that dependency does not install or expose
a permission engine. No new foundational package is introduced solely to move
those already neutral types.

Portable adapter constraints are not ACL objects. They are opaque namespaced
nodes that any plugin may contribute for row policy, tenant isolation, soft
deletion, or another database-enforced invariant. Runtime accumulates them and
the selected database plugin compiles only the kinds it has registered.

### Permission plugins install hooks

Permission plugins use the same application-owned hook dispatcher as every
other plugin. During setup they may target all schemas, an exact schema, a
schema extension, an exact field path, a field extension, or a field kind.

- `clpPermissionPlugin` contributes operation guards for the schemas carrying
  its extension or covered by its global policy;
- `aclPermissionPlugin` contributes guards, input validation, output
  restrictions, and opaque row constraints for the relevant operations;
- `fieldPermissionPlugin` contributes field-input guards and monotonic
  selection/output restrictions;
- `@ultimabase/access` defines a neutral typed role-resolution capability;
  `rolePermissionPlugin` is its official provider, while policy hooks consume
  only the capability and never import or identify that plugin directly.

The role capability is conditionally required. Installing CLP or ACL without a
provider is valid while the normalized policy contains no role reference. A
configured CLP role rule, ACL role subject, or default ACL role subject without
a provider fails application setup before infrastructure starts.

An application that installs none of these plugins registers none of their
hooks. Runtime does not manufacture neutral permission stages. A schema that
declares a permission extension without its owning plugin still fails Core's
existing extension-handler validation.

### Enforcement hook effects are monotonic

Ordinary transform hooks may replace an operation or result with the same exact
public type. Policy enforcement uses generic hook effects with stricter
contracts:

- a guard may allow execution or reject it, but cannot grant authority;
- an adapter constraint may only be appended and is combined with every other
  constraint using logical `AND`;
- an input or selection restriction may only narrow the currently allowed field
  set;
- an output restriction runs before a result becomes observable outside the
  enforcement boundary and cannot restore omitted values.

Accumulated enforcement state is held separately from the developer-transformable
Query and Operation AST. Later hooks cannot replace, clear, or inspect another
plugin's private constraint payload. This makes security independent from
plugin configuration order while retaining deterministic execution and
diagnostics.

The generic guard, constraint, and restriction contracts are available to
official and community plugins. Runtime validates their provenance and shape,
not their policy meaning.

### Hook order

Amendment on 2026-08-01: the original ordering placed monotonic enforcement
after business before-hooks and output restrictions before result transforms.
That would allow denied work to trigger business effects and would require
trusting later result transforms not to restore restricted fields. The
enforcement boundaries therefore wrap the effectful business lifecycle:

```text
normalization and structural validation
→ native and plugin input transforms
→ structural revalidation and business validation
→ monotonic guards, adapter constraints, and field restrictions
→ native and plugin before hooks
→ database operation
→ native and plugin after hooks
→ final monotonic output restrictions
→ beforeCommit
→ commit
→ afterCommit and post-commit events
```

Within each hook collection, dependency order, configuration position, and
registration order remain deterministic. Enforcement outcomes compose by deny,
logical `AND`, or set intersection, so reordering independent policy plugins
cannot broaden access.

## Consequences

- Installing CLP, ACL, or field permissions adds Runtime enforcement
  exclusively through plugin hook contributions. A policy plugin may also
  contribute its own schema, storage, migration, or adapter-compiler behavior.
- Runtime no longer changes when a new policy plugin is introduced.
- Missing permission plugins have no placeholder execution cost or public
  Runtime configuration.
- Database adapters receive generic constraints rather than ACL-specific
  objects and must reject an unclaimed constraint kind.
- `useMasterKey()` still establishes trusted authority, while each policy plugin
  decides whether that authority bypasses its own checks.
- ADR-0089's claim that permission plugins own reserved named stages is replaced
  by the monotonic enforcement-hook boundary in this record.
- The existing named stages remain temporarily implemented until issue 337
  removes them after the native plugin hook dispatcher is available.
