# 1209: Decompose Runtime pipeline orchestration

- Status: done
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1208
- ADR: ADR-0064, ADR-0099, ADR-0100, ADR-0164, ADR-0166

## Goal

Separate prepared mutation execution, inclusion projection, stage-input
construction, and pipeline orchestration while preserving the mandatory Runtime
order and public `RuntimePipeline` contract.

## Acceptance criteria

- [x] Database execution and prepared-mutation handling have focused internal ownership separate from stage orchestration.
- [x] Mutation relationship inclusion and projection helpers have focused internal ownership without replaying root Access or hooks.
- [x] Stage input and result construction reuse small typed helpers instead of repeated operation assertions.
- [x] `RuntimePipeline` remains the public composition and execution class with its existing constructor and request contract.
- [x] The exact normalization, Access, hook, validation, enforcement, transaction, commit, and post-commit order remains unchanged.
- [x] Itemized collection atomicity, target locking, prepared outcomes, selected fields, relation mutations, and error mapping remain unchanged.
- [x] No new stage, bypass option, adapter capability, public export, or execution path is introduced.

## Tests

- [x] A focused stage-trace regression protects the complete mandatory order before and after extraction.
- [x] Existing Runtime pipeline, hooks, Access, transaction, relation, mutation-projection, and adapter-fixture tests pass.
- [x] Typecheck and packed declarations prove no private orchestration type leaks publicly.

## Validation evidence

- `RuntimePipeline` now retains only immutable stage composition, public request
  validation, transaction creation, error mapping, and the mandatory top-level
  orchestration. Its constructor, `execute()` request/result contract, and
  `beginTransaction()` contract remain unchanged.
- `database-execution.ts` owns adapter capability validation, direct reads,
  target preparation and locking, input resolution, final revalidation,
  value-dependent enforcement, prepared execution, and mutation outcomes.
- `inclusion-projection.ts` owns singular and grouped mutation relationship
  reads, nested target enforcement, hydration, metadata retention, cardinality,
  and batch-order restoration. These internal reads continue to omit root
  mutation Access and lifecycle observers.
- `stage-inputs.ts` centralizes immutable operation, enforcement, prepared
  target, mutation outcome, database result, and final result envelopes. The
  touched production assertion count decreases from ten to eight; remaining
  erased operation and result boundaries document the invariant they restore.
- A focused update trace protects all 27 mandatory transitions from
  normalization and initial enforcement through target preparation, input
  transforms, one final revalidation, enforcement reevaluation, observers,
  persistence, result restrictions, commit, and post-commit delivery.
- Runtime, hook, Access, transaction, relation, mutation-projection, and
  adapter-fixture validation passes with 75 files and 443 tests. Repository
  tests pass with 286 files and 1,812 tests, including compile-time checks.
  Constraints, typecheck, lint, formatting, build, and Changesets validation
  pass.
- Packed-package validation passes with 7 files and 46 tests. A packed Core
  declaration regression proves the new database-execution, inclusion, and
  stage-input implementation names do not become public exports.

## Out of scope

- Runtime performance optimization without measurements.
- Set-based public mutation semantics.
- Database-specific execution changes.
