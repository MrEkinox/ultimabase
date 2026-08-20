# ADR-0189: Hooks and Access become optional official plugins

- Status: accepted
- Date: 2026-08-11
- Supersedes: the native mandatory-capability decisions in ADR-0089 and ADR-0116
- Refines: ADR-0090, ADR-0096, ADR-0097, ADR-0101, ADR-0102, ADR-0113, ADR-0120, ADR-0128, ADR-0161, ADR-0163, ADR-0166, ADR-0172
- Depends on: ADR-0186, ADR-0187, ADR-0188
- Refined by: ADR-0194, ADR-0202

## Context

Core currently owns the public schema and field `hooks` and `access` options,
their compiled plans, and their Runtime dispatch. Concrete ACL and role behavior
is already plugin-owned, but applications cannot remove the Hooks or Access
systems themselves or replace their developer experience with a community
engine.

The open plugin kernel must be proven by moving the most deeply integrated
optional product behaviors onto the same public contracts available to every
plugin author.

## Decision

### Core retains mechanisms, not products

Core retains generic middleware composition, immutable request context values,
transactions, cancellation, protected monotonic constraints, persistence-plan
execution, master authority, and post-commit delivery. It does not retain a
public Hooks or Access vocabulary after migration.

The current behavior moves into two publishable official packages:

- `@ultimabase/hooks-plugin` owns schema and field hook options, callback types,
  phase ordering, recursion safety, transaction integration, and hook
  diagnostics;
- `@ultimabase/access-plugin` owns schema and field Access options, operation,
  filter, item, and field decisions, `AccessPlan` compilation, protected
  restriction composition, and Access denial semantics.

Both packages use only public Core, `@ultimabase/plugin-kit`, and Typegen
contracts. Access additionally uses its dependency-light protocol package.
Their former native syntax
remains available only when the matching plugin is configured and the
application's generated contract includes it.

### Absence and alternatives

Without `hooks-plugin`, no hook options, dispatcher, placeholder handlers, or
Runtime hook work exists. Without `access-plugin`, no Access options, plan, or
Access enforcement exists. Master authority remains available to trusted server
code because it belongs to Core, not to Access.

Each official engine provides one versioned `single` capability while allowing
multiple providers around the selected engine. A community plugin may
provide an alternative Hooks or Access developer experience. Proof applications
must run with no engine and with a minimal alternative engine before the native
implementations are removed.

ACL becomes a provider of the versioned Access policy capability instead of
depending on a Core-native plan. Roles and authentication continue to provide
neutral typed context capabilities and grant nothing by themselves. PostgreSQL
integration continues compiling opaque versioned constraints without naming the
policy engine in Core.

### Migration and removal

The migration is intentionally breaking during pre-release development. Every
native declaration, implementation, test fixture, generated registry dependency,
barrel export, and documentation example receives a removal audit. No hidden
compatibility dispatcher, neutral no-op plugin, or private official-plugin
backdoor remains after the replacement packages prove parity.

Existing semantic order, automatic transaction behavior, protected monotonic
enforcement, complete hook items, master behavior, and ACL guarantees remain the
compatibility target of the official plugins unless a later ADR changes one of
those contracts explicitly.

## Consequences

- JavaScript and TypeScript applications can use UltimaBase without Hooks or
  Access.
- Community engines can offer different lifecycle or policy DX without forking
  Core.
- Official Hooks, Access, ACL, roles, and adapter integrations become the main
  conformance proof for the public plugin kernel.
- Core becomes smaller but still owns the security and transaction primitives
  required for safe composition.
- Application configuration must install the official plugins to retain the
  former native DX.

## Non-goals

- Moving master or master-key authority out of Core.
- Combining Hooks and Access into one plugin.
- Making ACL, roles, or authentication mandatory.
- Preserving deprecated Core exports after the removal audit.
