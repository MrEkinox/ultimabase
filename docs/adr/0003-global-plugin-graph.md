# ADR-0003: Global plugin graph with nested composition

- Status: superseded by ADR-0267
- Date: 2026-07-30

## Decision

All plugins belong to one deterministic application graph. A plugin’s `plugins` option is composition syntax that adds child definitions to the global graph and creates an implicit parent dependency.

## Consequences

Nested and top-level declarations are interoperable. Duplicates, conflicts, missing dependencies, and cycles can be validated centrally. Setup follows dependencies then configuration position; teardown reverses it.
