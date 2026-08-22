# 2101: Decide the single-pass mutation-validation boundary

- Status: ready
- Milestone: 21
- Packages: `@ultimabase/core`, Runtime documentation
- Depends on: none
- ADR: ADR-0221

## Goal

Refine ADR-0219 and ADR-0220 so Standard Schema field validation executes only
once on the complete final mutation candidate after input resolution, instead
of replaying application validation across persisted-result boundaries.

## Acceptance criteria

- [ ] ADR-0221 inventories every current caller that enables application
      validation for final mutation input, adapter results, mutation
      materializations, included records, behavior result replacements, and
      final selected results.
- [ ] The decision distinguishes repeatable Core structural snapshots from the
      one application Standard Schema pass.
- [ ] Create, update, and upsert candidates validate once after every configured
      field, schema, and prepared-operation input transformer.
- [ ] Defaults, generators, untransformed input, and transformed input remain
      covered by the final mutation pass without replaying defaults or
      generators.
- [ ] `increment` and `decrement` operands remain structural deltas; Runtime
      projects their complete resulting value from the already locked original
      target and validates that value once before persistence.
- [ ] Arithmetic projection does not replace the logical operation, weaken the
      adapter's atomic update, add another target read, or validate the delta as
      though it were the final field value.
- [ ] Reads, adapter output, materializations, includes, mutation outcomes, and
      final result projections do not execute application validators.
- [ ] Tightening or changing a validator cannot make an existing stored row
      unreadable merely because it no longer satisfies the new application
      rule.
- [ ] Core structural validation, field snapshots, codecs, protected
      constraints, database constraints, and migrations retain their current
      integrity responsibilities.
- [ ] Master authority bypasses neither structural validation nor the one final
      mutation application-validation pass.
- [ ] No optional read-validation flag, compatibility mode, validation plugin,
      or second field-validator contract is introduced.
- [ ] ADR-0219 and ADR-0220 reference the refining decision without rewriting
      their historical context.

## Tests

- [ ] The ADR names the required invocation-count, Runtime, type, Typegen,
      arithmetic-projection, packed-package, JavaScript, public E2E, and
      PostgreSQL coverage for issues 2102 and 2103.
- [ ] `yarn check:issues` and `yarn format:check` pass.

## Out of scope

- Implementing the Runtime change.
- Relaxing Core structural result validation.
- Async validation, database uniqueness, or automatic data migration.
- Replacing atomic adapter writes with application-side set operations.
