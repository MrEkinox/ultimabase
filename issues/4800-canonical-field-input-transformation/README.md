# Milestone 48 — Canonical field-input transformation

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `86581f87`

This milestone removes the Hooks plugin's historical copy of Core field-input
collection and transformation. Core exposes its existing generic immutable
transform helper as the one supported plugin-author boundary.

## Execution order

- [x] [4801 — Reuse Core field-input transformation](4801-reuse-core-field-input-transformation.md)

## Outcome

Core now exposes one typed immutable field-input transformer for behavior
engines. Hooks consumes it directly and no longer maintains its own mutation
decoder, field traversal, path reader, or transformer. Production TypeScript is
614 lines smaller while the complete Hooks conformance suite remains in place.

No push is authorized.
