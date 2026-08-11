# ADR-0194: Optional engine contract packages and unprotected transports

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0089, ADR-0096, ADR-0101, ADR-0106, ADR-0107, ADR-0116, ADR-0117, ADR-0120, ADR-0128, ADR-0161, ADR-0163, ADR-0167, ADR-0168, ADR-0169, ADR-0170, ADR-0171, ADR-0172, ADR-0189, ADR-0190
- Depends on: ADR-0189, ADR-0190, ADR-0191

## Context

ADR-0189 makes Hooks and Access optional engines, but a community alternative
or provider needs stable protocol tokens without importing Runtime behavior from
an official implementation. Core must not regain Hooks or Access product
vocabulary merely to host those tokens.

The behavior of a public transport with no Access-compatible policy engine also
needs an explicit security decision rather than an issue-level assumption.

## Decision

### Contract-only packages

UltimaBase publishes two dependency-light non-plugin packages:

- `@ultimabase/hooks-contracts` owns the versioned behavior-engine capability
  tokens, declaration descriptors, and provider protocol types;
- `@ultimabase/access-contracts` owns the versioned policy-engine and policy-
  provider capability tokens, protected decision descriptors, and neutral
  subject protocol types.

These packages contain no setup callback, Runtime implementation, default
engine, schema mutation, or automatic registration. Importing one never installs
behavior. Core does not import them.

The official `hooks-plugin` and `access-plugin`, community alternative engines,
ACL, and compatible providers depend on the appropriate contracts package.
They depend on protocol identity, not an official plugin name. Adapter bridge
packages may depend on the contracts needed to compile opaque contributions.

### No-engine behavior

Without a Hooks engine, declarations requiring a behavior-engine token fail
during static compilation and ordinary CRUD contains no hook stage.

Without an Access-compatible policy engine, direct application CRUD performs no
Access policy checks. Structural validation, transaction safety, protected Core
identity, and Master auditing remain active because they are not Access.

A public transport may run without a policy engine, but its default logger emits
one structured `UNPROTECTED_PUBLIC_TRANSPORT` warning during startup. The
transport configuration may explicitly acknowledge this supported mode to
silence the warning. The warning says `policy engine`, never `authority engine`,
and does not imply that Core Master or request authority is absent.

Official and alternative engines occupy the same versioned `single` capability.
Installing incompatible engines fails before static compilation. Multiple policy
providers may compose around the selected Access-compatible engine through a
separate `multiple` capability.

### Semantic migration remains exact

The official packages preserve the accepted contracts from the refined ADRs:
hook ordering, recursion, cancellation, transaction work, complete hook items,
Access operation/filter/item/field decisions, value transitions, relationship
recursion, final output restrictions, provider ordering, and explicit Master
bypass behavior.

Hook-started writes are ordinary Runtime operations sharing the automatic
transaction. This term does not introduce Prisma-style nested relational write
inputs.

## Consequences

- Community engines and providers share stable protocols without depending on
  official implementations or Core product vocabulary.
- Applications can intentionally expose a transport without Access while a
  visible warning protects against accidental exposure.
- Historical Hooks and Access semantics remain traceable during extraction.

## Non-goals

- Requiring Hooks, Access, authentication, ACL, or roles.
- Moving Master or master-key configuration out of Core.
- Publishing the contract packages before their first complete consumer issue.
