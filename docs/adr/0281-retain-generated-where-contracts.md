# ADR-0281: Retain generated Where contracts for the source-authoring milestone

- Status: accepted
- Date: 2026-09-30
- Refines: ADR-0279 and ADR-0280
- Approval: user chose to keep all schema `WhereInput` contracts in Typegen until the final milestone audit
- Decision issue: 6312 (archived at tag `reference-archive`: `issues/6300-source-typed-application-authoring/6312-plugin-author-conformance.md`)

## Context

ADR-0279 moved locally decidable plugin surfaces onto configured source
authoring while retaining the generated application schema-name graph. Issue
6312 found a community field with a portable JSON storage codec: Runtime and
Typegen both support complete-value equality, but the configured source
`where` type exposes only null checks for that custom kind. Two bounded
attempts to carry codec presence through the Core field type did not pass root
typecheck. This does not prove that TypeScript cannot express the contract.

The existing Typegen snapshot already derives portable equality from the
compiled field codec and emits the exact plugin value reference. Removing or
selectively replacing generated filters now would risk capability or editor
parity without evidence of a simpler complete source contract.

## Decision

For milestone 63, Typegen retains the complete `WhereInput` declaration for
**every schema**, including built-in, plugin-defined, structured, pointer,
and relation filters. The generated application registry supplies the complete
TypeScript `where` contract when available. Source inference before generation
may continue to provide a local bootstrap shape, but it is not claimed to be
complete for custom plugin operators. This retention is deliberate and must
not be counted as a Typegen reduction.

Typegen derives these declarations from the one authorized compiled graph and
consumed public type references. Plugins do not write manual declarations,
extra outputs, or a parallel filter registry. JavaScript applications still
execute the same Runtime graph without generation.

Issue 6313 must retain the `WhereInput` emitter, required snapshot facts,
registry references, and tests. Issue 6316 must list generated `where` as a
separate exception, measure its declaration/code and regeneration cost, and
present the failed source proof and possible later alternatives to the user.
Only then should the project decide whether any `where` portion can safely
leave Typegen.

## Consequences

- Plugin authors keep one field codec and public value reference; no new
  filter-specific Typegen declaration is added.
- TypeScript projects need their generated application declarations for the
  complete configured `where` experience, including portable equality on
  custom fields.
- Source-only filter inference remains an incomplete bootstrap aid. A test
  that deliberately omits the generated registry cannot establish complete
  community filter DX.
- This narrows ADR-0279's goal of Typegen being needed only for named
  cross-schema resolution, without changing schema syntax, Runtime, plugin
  powers, or the prohibition on parallel registries.
