# 2307: Normalize REST reads and queries

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2306
- ADR: ADR-0004, ADR-0229, and the issue 2302 REST contract

## Goal

Decode every REST read shape into the existing immutable Query and Operation
AST without adding transport nodes or executing it during normalization.

## Acceptance criteria

- [x] Collection find, singular get, and count requests normalize through one
      shared schema-aware boundary.
- [x] Accepted simple GET and complex request forms produce equivalent canonical
      filters, selections, inclusions, ordering, limits, and offsets.
- [x] Field-kind operators, pointer identity and target predicates, relation
      predicates, embedded object targets, null, and list values use existing
      Core normalization rather than parallel REST semantics.
- [x] Count remains its exact logical read operation so Access can authorize it
      independently from item reads.
- [x] Unknown fields, malformed operators, invalid scalar representations,
      unsupported combinations, excessive limits, and invalid pagination fail
      before Runtime with stable safe issues.
- [x] Complex read bodies enforce the accepted media type and streaming size
      limit before JSON parsing and never trust `Content-Length` alone.
- [x] The normalized AST contains no URL, header, HTTP method, request object,
      server value, raw credential, or transport-only node.
- [x] Normalization does not load targets, call hooks, evaluate Access, or issue
      adapter work.

## Tests

- [x] Parser matrix and class-API AST-equivalence tests cover every built-in and
      plugin-defined portable field capability.
- [x] Fuzzed malformed wire values cannot bypass Core normalization.

## Out of scope

- Mutation execution, plugin operations, response serialization, and
  transport-specific query operators.
