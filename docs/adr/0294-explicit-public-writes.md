# ADR-0294: Make public transport writes an explicit choice

- Status: accepted
- Date: 2026-10-08
- Refines: the REST and GraphQL `acknowledgeUnverifiedProtection` option and Core's `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` warning; applies ADR-0288
- Approval: user validated on 2026-10-08
- Implementation: with the developer-API challenge (`docs/handoff/api-challenge-plan.md`)

## Context

Policies are plugins: Core knows no Access or ACL product, and a fully open
UltimaBase application is a legitimate choice. Today a REST or GraphQL
application without any protected policy exposes anonymous create, update and
delete routes (an anonymous POST returned 201). Core only prints a warning,
computed from a generic signal: whether any protected policy contribution is
installed (`packages/core/src/runtime/plugin-operations/engine-integration.ts`).
The warning fires even when a policy is installed, and
`acknowledgeUnverifiedProtection: true` silences it without expressing a
decision. Open-by-default backends are a known cause of data leaks.

## Decision

- A transport that would expose write operations while no protected policy
  contribution is installed refuses to start, with a message naming the two
  ways forward: install a policy plugin, or opt into public writes.
- `publicWrites: true` on the REST and GraphQL plugins is that explicit opt-in.
  It replaces `acknowledgeUnverifiedProtection`, which is removed.
- When a protected policy is installed, the startup warning is removed: its
  presence is the developer's decision, and coverage cannot be proven anyway.
- Core keeps the generic signal and never names a policy plugin.

## Consequences

A fully open application stays one option away, but never happens by
omission. Read-only applications without policies are unaffected. The
`create-app` templates and examples state the choice explicitly.
