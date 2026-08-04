# ADR-0128: Explicit master bypass for policy-neutral enforcement

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0102, ADR-0106, ADR-0116, ADR-0122

## Context

Native Access contributions already declare whether trusted master execution
bypasses or enforces each independent policy. Low-level policy-neutral guards,
adapter constraints, and field restrictions previously had no equivalent
metadata, so a provider could only inspect master authority inside its handler.

That check happens after hook recursion protection. When ACL resolves current
stored roles, the role provider performs trusted internal RoleSchema queries.
An ACL protecting that same RoleSchema would therefore re-enter the identical
ACL constraint hook before its handler could return an empty master result.
Disabling general hook recursion or recognizing a concrete role plugin would
weaken Core's boundaries.

ACL reference maintenance has the opposite requirement: its trusted internal
queries must still contribute an exact reference constraint. One inferred
master rule for every contribution cannot represent both cases.

## Decision

Every policy-neutral enforcement definition may declare
`master: "bypass" | "enforce"`. Omission means `"enforce"`, preserving the
secure existing behavior. The choice is retained privately with the executable
handler and does not expose policy state through the public definition object.

Runtime skips a bypassed contribution before hook invocation, recursion checks,
or accumulated enforcement state. It never infers bypass from a plugin name,
constraint kind, request source, or returned value.

Providers split concerns when their trusted behavior differs. ACL therefore
registers:

- one authorization constraint with explicit master bypass; and
- one separate reference-maintenance constraint that remains enforced for
  trusted cleanup queries and otherwise returns no nodes.

This is the low-level equivalent of contribution-owned native Access master
behavior. It is not a general hook bypass and does not skip validation,
business hooks, transactions, database constraints from other contributions,
or committed events.

## Consequences

- Stored-role resolution can query an ACL-protected RoleSchema without
  recursive policy execution.
- ACL reference fail and cascade policies still constrain trusted maintenance
  queries correctly.
- Advanced providers can express audited master behavior without teaching Core
  their policy vocabulary.
- An omitted option remains fail-closed for master, and each bypass stays
  explicit and independently testable.
