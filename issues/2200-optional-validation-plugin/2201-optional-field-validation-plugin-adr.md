# 2201: Decide the optional field-validation plugin boundary

- Status: completed
- Milestone: 22
- Packages: `@ultimabase/core`, `@ultimabase/validation-plugin`, architecture documentation
- Depends on: none
- ADR: ADR-0223

## Goal

Refine ADR-0219 and ADR-0221 so Core retains structural validation while the
direct field `validation` option and its Standard Schema application behavior
move into one optional official plugin.

## Acceptance criteria

- [x] ADR-0223 distinguishes Core structural ownership from optional
      application field validation.
- [x] The accepted package identity is `packages/validation-plugin` and
      `@ultimabase/validation-plugin`, created only when implementation starts.
- [x] The plugin owns `validation`, its Standard Schema compatibility types,
      normalization, execution, issue mapping, and projected arithmetic
      application checks.
- [x] Core keeps `required`, nullability, canonical shape, defaults, generators,
      immutable and generated rules, decimal precision and scale, structural
      plans and snapshots, and Runtime orchestration.
- [x] The option is application-local: an application without the plugin has no
      generated `validation` option and rejects an untyped declaration that
      uses it during application compilation.
- [x] The single-pass ordering, synchronous rejection-only behavior, read-side
      absence, arithmetic semantics, and Master non-bypass are preserved.
- [x] One generic rejection-only Runtime boundary is required before extraction;
      Core does not gain a validation-plugin-specific capability or stage.
- [x] The extraction is atomic and removes the superseded Core option, public
      types, implementation, tests, documentation, and dependency without a
      compatibility path.
- [x] ADR-0219 and ADR-0221 reference the refining decision without rewriting
      their historical context.

## Tests

- [x] `yarn check:issues` and `yarn format:check` pass for the planning change.

## Verification

- `corepack yarn check:issues`
- `corepack yarn format:check`

## Out of scope

- Implementing the Runtime boundary or plugin package.
- Moving `required` or any structural field option out of Core.
- Adding async validation, read validation, global validators, provider
  contributions, or a second field-validator property.
