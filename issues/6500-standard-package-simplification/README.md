# Milestone 65: Standard package simplification

- Status: in-progress
- Goal: delegate standard mechanics without losing behavior or adding a larger bridge.

## Execution order

- [x] [6501: Test Valibot option normalization](6501-valibot-options.md)
- [x] [6502: Delegate GraphQL schema composition](6502-graphql-tools-composition.md)
- [ ] [6503: Test atomic generated-file writing](6503-atomic-writing.md)

## Boundary

The user approved sequential keep-or-reject experiments on 2026-10-02.
Markdown parsing and Pothos are not part of this sequence. Preserve public
contracts, exact diagnostics, plugin ownership, immutable snapshots, Node 24.0,
Typegen's retained graph, Runtime order and the complete validation gate.
