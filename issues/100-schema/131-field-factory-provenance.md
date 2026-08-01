# 131: Authenticate field factory definitions

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 130
- ADR: 0033

## Goal

Prevent structurally forged fields from bypassing declaration invariants while
removing duplicated built-in snapshot dispatch.

## Acceptance criteria

- [x] Every official and plugin field uses one capability-aware factory.
- [x] Schema composition rejects definitions without factory provenance.
- [x] Built-in and reserved field kinds have one shared declaration.
- [x] Object defaults reuse each field's registered snapshot behavior.
- [x] Runtime tests cover forged definitions and missing capabilities.
