# Milestone 17 — Validation interoperability

- Status: in-progress

Replace fragile local protocol machinery with focused, established public
standards where a current framework boundary proves the need. The milestone
first fixes structural equality for persisted JSON snapshots, then lets plugin
authors validate options through Standard Schema without coupling
`@ultimabase/plugin-kit` to a particular validation library.

Neither issue broadens Core's product responsibilities. JSON equality remains
an internal Core implementation detail, while Standard Schema support remains
a synchronous plugin-authoring convenience above Core.

## Execution order

1. [x] [1701 — Compare migration JSON snapshots structurally](1701-structural-json-snapshot-equality.md)
2. [ ] [1702 — Accept Standard Schema plugin option validators](1702-standard-schema-plugin-options.md)
