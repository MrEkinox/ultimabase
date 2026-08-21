# 2008: Validate fields after input resolution

- Status: completed
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/hooks-plugin`, official examples
- Depends on: 2005
- ADR: ADR-0220

## Goal

Keep the initial mutation boundary structural, then run one mandatory Core-owned
field-validation boundary after every behavior input transformation. A value
may therefore be normalized explicitly by Hooks `resolveInput` before Standard
Schema accepts or rejects the final candidate, without letting community
behavior providers opt out of final validation.

## Acceptance criteria

- [x] Initial mutation validation still resolves defaults and generators and
      enforces type, presence, nullability, canonical snapshots, structured
      shape, immutable fields, relation deltas, and unique upsert targets, but
      does not execute application Standard Schema validators.
- [x] Every mutation candidate crosses one mandatory final Core validation
      boundary after field, schema, and prepared-operation transformations and
      before value-dependent enforcement, observers, or persistence.
- [x] Final validation reuses the original normalized operation to protect
      generated update operations, relationship deltas, and unique upsert
      targets without replaying defaults or generators.
- [x] Standard Schema still validates generated/defaulted values, untransformed
      mutations, transformed values, adapter results, materializations,
      includes, and final results; Master authority bypasses none of them.
- [x] `RuntimeBehaviorStages` no longer exposes `revalidateInput`: Core owns the
      invariant, and community transformers require no validation callback.
- [x] Runtime replacement receives both mandatory validation stages and cannot
      omit the final boundary from the Core-provided stage graph.
- [x] The incompatible Runtime executor and behavior capability contracts
      advance to version `2.0.0` without a legacy parallel protocol.
- [x] Documentation explains that `resolveInput` receives structurally valid
      input and that Standard Schema validates the final canonical candidate.

## Tests

- [x] A slug-like value rejected by the final validator can first be normalized
      by a field Hook and then pass validation.
- [x] The same raw value fails without the transforming Hook, including under
      Master authority.
- [x] A community behavior transform is structurally and application-validated
      without contributing `revalidateInput`.
- [x] Pipeline ordering, Runtime replacement, source and packed public exports,
      TypeScript declarations, JavaScript, and application isolation remain
      covered.
- [x] `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, `yarn build`, and `yarn test:pack` pass.

## Out of scope

- Allowing Standard Schema to transform or default field values.
- Moving type, presence, nullability, canonical snapshot, or protected Access
  checks after developer callbacks.
- Adding phase-specific validators or a validation plugin capability.

## Verification

- `yarn constraints`
- `yarn check:issues` — 9 tests passed
- `yarn typecheck`
- `yarn test` — 340 files and 1,711 tests passed
- `yarn lint` — passed with only centralized line-budget warnings
- `yarn format:check`
- `yarn build`
- `yarn test:pack` — 19 files and 93 tests passed
- Todo backend workspace typecheck
- focused Hooks/PostgreSQL Testcontainers suite — 1 file and 5 tests passed
