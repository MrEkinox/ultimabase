# 4801: Reuse Core field-input transformation

- Status: completed
- Milestone: 48
- Packages: `@ultimabase/core`, `@ultimabase/hooks-plugin`
- Depends on: 4701
- ADR: ADR-0189

## Goal

Make Core's existing immutable field-input transformer the single public
implementation used by optional behavior engines, then remove Hooks' copied
collector, traversal, path, and transformation modules.

## Acceptance criteria

- [x] Core deliberately exports the generic transformation helper and visitor.
- [x] Hooks resolves field inputs exclusively through the public Core boundary.
- [x] The copied Hooks collection and traversal modules are removed.
- [x] Nested objects, lists, updates, bulk items, and immutable replacement keep
      their existing conformance coverage.
- [x] Public TypeScript inference and the package export manifest are tested.
- [x] Core and public plugin-author documentation describe the helper.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing Hooks callback order, field declarations, or lifecycle semantics.
- Allowing plugins to replace Core normalization or transaction stages.
- Making virtual or output-only fields mutation inputs.
- Generalizing transformation beyond normalized persisted operation fields.

## Outcome

`transformOperationFieldInputs()` and `RuntimeFieldInputVisitor` are deliberate
Core root exports with exact operation-type preservation. Hooks imports the
helper from `@ultimabase/core`; its three copied Runtime modules are deleted.
The former Hooks tests now exercise the Core implementation through the public
package boundary, preserving nested-object, object-list, update, bulk-item,
observation, immutable-replacement, and missing-path behavior.

Core remains the only owner of normalized persisted field traversal. The helper
does not install a Runtime stage or grant a plugin any authority; an authorized
behavior contribution still decides when it is invoked.

## Quantitative audit

Production TypeScript adds 14 lines and removes 628 (net -614). The three
deleted Hooks modules account for 613 removed lines; Core's canonical
`field-values.ts` also falls from 588 to 585 lines despite its stronger public
JSDoc and simplified path-result type. Tests add 33 lines and remove 13 (net
+20), including one compile-time public generic contract. Public documentation
adds 17 lines.

## Validation

- `yarn workspace @ultimabase/core test`: 262 files, 1,347 tests
- `yarn workspace @ultimabase/hooks-plugin test`: 20 files, 83 tests
- `yarn website:validate`: 17 files, 66 tests
- `yarn typecheck`
- `yarn test`: 541 files, 2,575 tests, no type errors
- `yarn lint`: 0 errors; 50 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting

## Documentation impact

Public website documentation. The Core package contract and plugin-author
Runtime guide now document the canonical transformer, its immutable
children-first semantics, exact generic result, and the fact that it grants no
Runtime authority. Hooks' public behavior is unchanged.
