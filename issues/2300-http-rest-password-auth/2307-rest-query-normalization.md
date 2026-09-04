# 2307: Normalize REST reads and queries

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2306
- ADR: ADR-0004 and the issue 2302 REST contract

## Goal

Decode every REST read shape into the existing immutable Query and Operation
AST without adding transport nodes or executing it during normalization.

## Acceptance criteria

- [ ] Collection find, singular get, and count requests normalize through one
      shared schema-aware boundary.
- [ ] Accepted simple GET and complex request forms produce equivalent canonical
      filters, selections, inclusions, ordering, limits, offsets, and cursors.
- [ ] Field-kind operators, pointer identity and target predicates, relation
      predicates, embedded object targets, null, and list values use existing
      Core normalization rather than parallel REST semantics.
- [ ] Count remains its exact logical read operation so Access can authorize it
      independently from item reads.
- [ ] Unknown fields, malformed operators, invalid scalar representations,
      unsupported combinations, excessive limits, and invalid cursors fail
      before Runtime with stable safe issues.
- [ ] Complex read bodies enforce the accepted media type and streaming size
      limit before JSON parsing and never trust `Content-Length` alone.
- [ ] The normalized AST contains no URL, header, HTTP method, request object,
      server value, raw credential, or transport-only node.
- [ ] Normalization does not load targets, call hooks, evaluate Access, or issue
      adapter work.

## Tests

- [ ] Parser matrix and class-API AST-equivalence tests cover every built-in and
      plugin-defined portable field capability.
- [ ] Fuzzed malformed wire values cannot bypass Core normalization.

## Out of scope

- Mutation execution, plugin operations, response serialization, and
  transport-specific query operators.
