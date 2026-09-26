# Milestone 43 — Runtime stage-plan simplification

- Status: in-progress
- Authorization: user request of 2026-09-26
- Baseline: `d39fa480`

This milestone removes repeated scans while assembling the ordered Runtime
behavior and interceptor plans. It preserves the exact capability graph order,
stage positions, callback ownership, error propagation, and optional-stage
absence required by ADR-0199 and ADR-0259.

Every implementation issue must reduce handwritten production code, replace
several scans with one direct pass, and avoid a generic dynamic stage registry.

## Execution order

- [x] [4301 — Collect Runtime behavior stages in one pass](4301-runtime-behavior-stage-collection.md)
- [x] [4302 — Collect Runtime interceptor stages in one pass](4302-runtime-interceptor-stage-collection.md)
- [ ] [4303 — Complete parity and reduction audit](4303-parity-and-reduction-audit.md)

If either issue changes provider ordering, contribution placement, Runtime
stage order, callback attribution, or a public contract, implementation stops
for an architecture decision.

No push is authorized.
