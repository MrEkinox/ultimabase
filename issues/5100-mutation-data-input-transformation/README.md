# Milestone 51 — Mutation data input transformation

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `6fce9471`

This milestone removes the duplicate schema and nested-write traversal
maintained by the REST and GraphQL mutation decoders. Core owns only immutable
recursion through mutation field maps and nested target data. Each transport
keeps its wire wrappers, command validation assumptions, identities, codecs,
and public errors.

## Execution order

- [x] [5101 — Consolidate transport mutation-data traversal](5101-consolidate-transport-mutation-data-traversal.md)

## Constraints

- Preserve every accepted REST and GraphQL mutation and every current
  rejection.
- Keep JSON/HTTP, GraphQL, scalar, UUID-wire, and transport-error policy out of
  Core.
- Keep mutation request envelopes, projections, bulk shapes, and Runtime graph
  normalization unchanged.
- Stop and record the audit if the shared boundary does not delete production
  lines overall or requires command-specific transport adapters in Core.

No push is authorized.

## Outcome

Core now exports one immutable mutation-data transformer. REST and GraphQL each
retain one transport-owned field callback while Core classifies schema fields
and traverses nested pointer/relation target data. The implementation removes
212 and adds 189 production TypeScript lines, for a net reduction of 23 lines,
while adding focused runtime, type, and GraphQL nested-codec coverage.
