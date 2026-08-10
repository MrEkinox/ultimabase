# 1209: Decompose Runtime pipeline orchestration

- Status: ready
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1208
- ADR: ADR-0064, ADR-0099, ADR-0100, ADR-0164, ADR-0166

## Goal

Separate prepared mutation execution, inclusion projection, stage-input
construction, and pipeline orchestration while preserving the mandatory Runtime
order and public `RuntimePipeline` contract.

## Acceptance criteria

- [ ] Database execution and prepared-mutation handling have focused internal ownership separate from stage orchestration.
- [ ] Mutation relationship inclusion and projection helpers have focused internal ownership without replaying root Access or hooks.
- [ ] Stage input and result construction reuse small typed helpers instead of repeated operation assertions.
- [ ] `RuntimePipeline` remains the public composition and execution class with its existing constructor and request contract.
- [ ] The exact normalization, Access, hook, validation, enforcement, transaction, commit, and post-commit order remains unchanged.
- [ ] Itemized collection atomicity, target locking, prepared outcomes, selected fields, relation mutations, and error mapping remain unchanged.
- [ ] No new stage, bypass option, adapter capability, public export, or execution path is introduced.

## Tests

- [ ] A focused stage-trace regression protects the complete mandatory order before and after extraction.
- [ ] Existing Runtime pipeline, hooks, Access, transaction, relation, mutation-projection, and adapter-fixture tests pass.
- [ ] Typecheck and packed declarations prove no private orchestration type leaks publicly.

## Out of scope

- Runtime performance optimization without measurements.
- Set-based public mutation semantics.
- Database-specific execution changes.
