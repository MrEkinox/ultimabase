# ADR-0265: Remove the Typegen emitter marker

- Status: superseded
- Superseded by: ADR-0297 (Typegen removed in migration step 6.8b, 2026-10-13)
- Date: 2026-09-21
- Decision issue: 3107 (archived at tag `reference-archive`: `issues/3100-residual-complexity-simplification/3107-decide-unused-public-protocols.md`), RC-05
- Implementation: 3109 (archived at tag `reference-archive`: `issues/3100-residual-complexity-simplification/3109-remove-unread-typegen-emitter-marker.md`)
- Reopens: C-039 in the milestone 30 matrix (archived at tag `reference-archive`: `docs/plans/2026-09-20-architecture-contract-matrix.md`)
- Approval: user explicitly accepted all three separately presented RC-04/RC-05/RC-06 removals on 2026-09-21, including the engineering-consumer exceptions

## Evidence and correction to the inventory

`typegenPlugin` provides the declaration-lifetime single capability
`ultimabase.typegen-emitter`. Its value is only `{ kind: 'typegen-emitter' }`.
Setup directly builds the compiled snapshot, generates declarations and writes
the file; it never resolves that capability to select or invoke an emitter.

There is no production consumer selecting generation through this token, but
the earlier phrase "no reader" understated its actual use. Core's
`typegen-declarations.test.ts` and the public open-kernel workflow/value
fixtures declare an optional requirement and use it in `when` for
`typegen:reference`. Core reads its availability to activate the declaration
facade. Open-kernel, alternative-policy and optional-Hooks E2E fixtures provide
the marker without installing the filesystem-writing Typegen plugin. These
are real engineering consumers, not absent usage.

Sources: [token](../../packages/core/src/plugins/capability-token.ts),
[Typegen setup](../../packages/typegen/src/plugin.ts),
[conditional declarations](../../packages/core/src/plugins/typegen-declarations.test.ts),
[workflow](../../tests/e2e/fixtures/open-kernel-workflow.ts),
[value fixture](../../tests/e2e/fixtures/open-kernel-value.ts).

## Decision and exact scope

Remove Core exports `typegenEmitterCapability` and `TypegenEmitterCapability`,
their token declaration and barrels, and Typegen's inert provider and its
`TypegenPlugin` capability tuple. Remove fixture-only providers/requirements
of this token. No replacement emitter token, selection API, private registry
or hidden Core-to-Typegen dependency is introduced.

This explicitly removes four public conventions:

1. Core's emitter-specific single-provider conflict, including conflicts between
   the official plugin and a differently identified marker provider;
2. inspection of that provider/capability;
3. required/optional dependencies on that nominal token;
4. privilege activation conditioned on its presence, including the engineering
   fixtures above.

Two copies of the official Typegen plugin still conflict on plugin identity.
An unrelated emitter no longer conflicts merely because it emits types; Core
does not infer or arbitrate its filesystem effects. Generic capability
cardinality, requirements, inspection and conditional privileges remain intact.

For retained workflow/value proofs, request `typegen:reference` directly and
register their current references through the existing facade. This makes
their fixture declaration independent of marker presence; it does not grant
the privilege implicitly or add production behavior. Keep conditional-facade
and denial coverage using the already existing generic capability fixtures in
`declaration-host.test.ts` and `capabilities.test.ts`, not a renamed emitter.

Keep automatic startup generation before connection, `applicationId` and
`outputPath`, atomic writes, public type references, compiled graph ownership,
deterministic output/fingerprints, editor inference, the filesystem claim,
and Typegen-free JavaScript behavior. No generator version or production golden
change is intended; any unexpected output delta stops implementation for audit.

## Verification and documentation

3109 must compare source/built/packed types and production generated artifacts,
exercise Typegen startup/claim denial and initializer TS/JS projects, and retain
generic conflict, conditional privilege and ownership tests. Update Core and
Typegen READMEs and review website `guides/generate-types`,
`plugins/build-a-plugin/schemas-and-typegen` and
`plugins/build-a-plugin/index` in that issue. Live documentation
continues to describe the current API until removal is implemented.

## Alternative considered and outcome

Retain the marker if its uniqueness or conditional-declaration convention is a
current requirement; then supersede 3109. Recommended: remove this convention
and adapt the enumerated engineering fixtures, while retaining the generic
mechanisms and the actual generator. This is an explicit public-contract
exception, not a claim that no observable behavior disappears.

Outcome: the user accepted the exact removal above. The implementation remains
bounded by this inventory and must complete its own validation/audit loop.
