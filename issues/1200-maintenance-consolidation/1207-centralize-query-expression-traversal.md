# 1207: Centralize guarded Query-expression traversal

- Status: completed
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1206
- ADR: ADR-0054, ADR-0055, ADR-0135, ADR-0156

## Goal

Reuse one focused internal traversal for the current guarded Query-expression
walks performed by native Access and policy-neutral Enforcement.

## Acceptance criteria

- [x] One internal Query-domain traversal owns recursion through current logical and nested expression containers.
- [x] Native Access field collection and Enforcement relation-predicate collection reuse the traversal without duplicating structural recursion.
- [x] Callers retain ownership of whether a relation leaf is collected, skipped, or treated as a target boundary.
- [x] Malformed or untrusted expression-like values are rejected or ignored according to the existing caller contract before a typed node is consumed.
- [x] The traversal is internal and adds no root export, AST node, plugin hook, visitor extension point, or transport contract.
- [x] Existing expression ordering, maximum-depth enforcement, pointer traversal, and direct-relation semantics remain unchanged.
- [x] Double assertions used only to recurse through expression containers are removed where the guarded traversal establishes the invariant.

## Tests

- [x] Focused traversal tests cover logical nesting, wrapped expressions, relation leaves, malformed containers, and deterministic order.
- [x] Native Access, Enforcement, relation-filter, and PostgreSQL compiler tests pass unchanged.
- [x] Public declarations and packed exports contain no traversal implementation type.

## Validation evidence

- `traverseQueryExpression` now owns guarded depth-first recursion through
  `expressions` and `expression` containers. Its three directives let callers
  continue locally, stop at a leaf, or enter a relation target while retaining
  target-depth ownership.
- Relation-predicate collection, native Access filter-field collection, and
  policy-neutral Enforcement direct-relation collection reuse the traversal.
  Their recursive double assertions were removed without changing collection
  order, pointer filtering, relation boundaries, or the portable depth limit.
- Focused tests cover logical and wrapped expressions, deterministic order,
  target and stop directives, malformed children, shared siblings, and circular
  containers. Existing Access, Enforcement, relation-filter, Runtime pipeline,
  and PostgreSQL filter/relation compiler suites pass unchanged.
- The root runtime export manifest remains unchanged. Packed Core declarations
  contain none of the traversal function or implementation type names.
- Repository tests pass with 285 files and 1,809 tests, including compile-time
  checks. Constraints, typecheck, lint, formatting, build, and Changesets
  validation pass.
- Packed-package validation passes with 7 files and 45 tests, including archive
  boundaries and the internal-traversal declaration check.

## Out of scope

- Plugin-defined Query expressions.
- Changing relation predicate semantics.
- A general-purpose public AST visitor.
