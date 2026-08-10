# 1207: Centralize guarded Query-expression traversal

- Status: ready
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1206
- ADR: ADR-0054, ADR-0055, ADR-0135, ADR-0156

## Goal

Reuse one focused internal traversal for the current guarded Query-expression
walks performed by native Access and policy-neutral Enforcement.

## Acceptance criteria

- [ ] One internal Query-domain traversal owns recursion through current logical and nested expression containers.
- [ ] Native Access field collection and Enforcement relation-predicate collection reuse the traversal without duplicating structural recursion.
- [ ] Callers retain ownership of whether a relation leaf is collected, skipped, or treated as a target boundary.
- [ ] Malformed or untrusted expression-like values are rejected or ignored according to the existing caller contract before a typed node is consumed.
- [ ] The traversal is internal and adds no root export, AST node, plugin hook, visitor extension point, or transport contract.
- [ ] Existing expression ordering, maximum-depth enforcement, pointer traversal, and direct-relation semantics remain unchanged.
- [ ] Double assertions used only to recurse through expression containers are removed where the guarded traversal establishes the invariant.

## Tests

- [ ] Focused traversal tests cover logical nesting, wrapped expressions, relation leaves, malformed containers, and deterministic order.
- [ ] Native Access, Enforcement, relation-filter, and PostgreSQL compiler tests pass unchanged.
- [ ] Public declarations and packed exports contain no traversal implementation type.

## Out of scope

- Plugin-defined Query expressions.
- Changing relation predicate semantics.
- A general-purpose public AST visitor.
