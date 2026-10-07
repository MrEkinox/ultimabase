# ADR-0013: Access modes and master authority

- Status: superseded
- Date: 2026-07-30
- Superseded by: ADR-0113

## Decision

The only access modes are `anonymous`, `user`, and `master`. Trusted server code may request master execution with a reason. Transport input cannot forge master authority.

## Consequences

Jobs use a service user or master rather than a separate system mode. Master bypasses CLP, ACL, and field permissions by default but not type validation, SQL constraints, transactions, business hooks, or tenant isolation.
