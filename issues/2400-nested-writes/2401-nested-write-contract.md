# 2401: Decide the nested-write contract

- Status: ready
- Milestone: 24
- Packages: architecture documentation
- Depends on: none
- ADR: proposed ADR-0243

## Goal

Accept one exact transport-neutral developer, execution, security, and wire
contract for nested pointer and relation writes before implementation begins.

## Acceptance criteria

- [ ] An accepted ADR defines nested commands inside schema mutation `data`
      while keeping stored values separate from the normalized executable graph.
- [ ] The ADR fixes the exact `createOne` and `updateOne` pointer and relation
      command matrix, requiredness rules, and result projection timing.
- [ ] Field-bound `connect`, `disconnect`, and `set` accept canonical string IDs
      and derive the exact target schema from the field rather than requiring a
      redundant public `Pointer` or class name.
- [ ] Pointer command exclusivity, relation incremental composition,
      `set`/`clear` exclusivity, duplicate targets, contradictory targets, and
      full pre-effect validation have deterministic rules.
- [ ] Dependency and Hook order is explicit for pointer-created targets, root
      rows, inverse-pointer children, owning relation edges, nested updates, and
      final transaction-bound inclusion.
- [ ] Every nested object mutation retains standalone structural validation,
      optional Validation, Hooks, Access, ACL, protected constraints,
      cancellation, application provenance, authority, and callback attribution.
- [ ] Recursive input and execution limits protect direct and transport calls
      from unbounded depth or operation count without adding adapter-specific
      behavior.
- [ ] REST create and patch bodies plus generated GraphQL input names and field
      shapes are fixed, including safe error ownership and schema-aware ID
      decoding.
- [ ] The ADR records the intentional removal or retention of existing relation
      handle Pointer/model targets and REST tagged-pointer mutation inputs; no
      accidental compatibility alias remains.
- [ ] Nested delete/upsert, bulk roots, provisional references, cyclic create
      graphs, arbitrary unique-filter connect, and partial success remain
      explicitly out of scope.

## Tests

- [ ] `yarn check:issues`, focused documentation checks, `yarn format:check`,
      and `git diff --check` pass.

## Out of scope

- Changing a public TypeScript type, Runtime operation, transport schema, or
  database adapter.
