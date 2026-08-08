# ADR-0166: One final mutation validation before observers

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0070, ADR-0102, ADR-0164
- Refined by: ADR-0172

## Context

Mutation input may be transformed by native field `resolveInput`, schema
`resolveInput`, and the advanced target-aware `preparedOperation()` hook. The
pipeline previously validated and reevaluated Access after several individual
transformers, then allowed low-level `beforeOperation()` contributions to
replace the operation and repeated the same work again.

That order made a callback's behavior depend on which transformation boundary
it used. It also prepared PostgreSQL with one constraint collection and ignored
the cumulative collection returned after value-dependent policy reevaluation.
The target remained locked, but the final write could therefore compile stale
constraints.

## Decision

### Transformers finish before one final validation

Runtime applies mutation transformations in this order:

```text
normalization and initial structural validation
→ initial operation, field, and item Access
→ prepare and lock the visible target when one may exist
→ field resolveInput
→ schema resolveInput with originalItem
→ target-aware preparedOperation
→ one structural revalidation without defaults or generators
→ monotonic value-dependent Access reevaluation
→ low-level and native before-operation observers
→ database write
```

The initial Access pass prevents denied operations and targets from reaching
developer input resolvers. Create and mutation-field decisions that depend on
the transformed candidate run again after the single final revalidation. The
second enforcement state is retained and used by selection and output
restrictions for the remainder of the operation.

If no transformer returns a different operation, Runtime does not manufacture
another validation or reevaluation pass. Reads have no mutation input
transformer and therefore use only their initial structural validation and
enforcement pass.

### Before-operation hooks are observers

Low-level plugin `beforeOperation()` handlers now return `void`. They may
inspect the final immutable operation, perform transactional work, or throw,
but they cannot replace the AST. Native schema `beforeOperation` handlers keep
the same observer semantics.

`preparedOperation()` remains the only low-level operation transformer. It is
restricted to schema-scoped `update-one` values after the target is locked and
cannot change the terminal, schema, query, update fields, or operators. General
normalization belongs in field or schema `resolveInput`.

Low-level `afterOperation()` remains a result transformer and must return the
exact `{ result }` wrapper.

Targetless creates complete resolution, final Access, and before-operation
observers before the adapter is prepared. A rejected create therefore never
reaches `prepare()`. Mutations that may expose an existing item still prepare
first because their target must be protected and locked before target-aware
developer code runs.

### Prepared writes receive final constraints

A prepared database handle separates target preparation from execution.
Runtime always executes it with an immutable request containing the final
operation and the complete cumulative `constraints` collection. An adapter
must compile those final constraints for the actual update, delete, or upsert
write while retaining the target selected by the initial protected lock.

PostgreSQL compiles the initial request for target locking and recompiles the
final execution request immediately before the write. The retained target and
the final constraints are combined with logical `AND`; later policy evaluation
can only narrow the permitted write. Calling a prepared handle without an
execution request remains an adapter-level compatibility path that reuses the
prepared operation and constraints, but Core Runtime never uses that path.

## Consequences

- Every transformed mutation candidate crosses one predictable final
  validation and Access boundary.
- Business observers cannot create a new unvalidated operation after that
  boundary.
- A value-derived constraint added during reevaluation protects the actual
  database write rather than only Runtime's in-memory state.
- Target locking may happen before business observers and nested work started
  by those observers, but all writes still share the same automatic
  transaction.
- Adapter authors must distinguish the request used to prepare a target from
  the final request used to execute its write.
