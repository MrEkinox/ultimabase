# ADR-0077: PostgreSQL connection ownership and sanitization

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0007, ADR-0049, ADR-0050

## Decision

`postgresPlugin` accepts exactly one connection source: a URL or a structurally
compatible existing pool. A URL creates an application-owned `pg` pool during
plugin setup without opening a network connection. The lifecycle `connect`
phase verifies that pool once and releases the borrowed client immediately.

An injected pool remains developer-owned. UltimaBase verifies it but never ends
it. Application-owned pools close once during stop, failed-start cleanup, or
service disposal. A close racing with verification remains the final lifecycle
state.

The public connection service exposes typed lifecycle state and control without
exposing the raw pool or URL. Connection and disposal failures discard driver
messages and causes because they may contain credentials; only a string driver
code may be retained as trusted diagnostic metadata.

## Consequences

Application construction remains free of database I/O, startup proves
connectivity at a deterministic lifecycle boundary, and ownership is explicit.
Applications cannot restart a closed PostgreSQL connection. Developers who
inject a pool must dispose it themselves.

The package exports a minimal structural pool type for configuration but does
not re-export `pg` classes or Drizzle runtime values. Later PostgreSQL internals
may consume the managed pool without placing it in application or request
context.
