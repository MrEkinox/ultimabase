# ADR-0246: Schema option absence is selectable and plugin powers are static

- Status: accepted
- Date: 2026-09-10
- Refines: ADR-0191, ADR-0196, ADR-0213, ADR-0245
- Depends on: ADR-0191, ADR-0196, ADR-0213, ADR-0245

## Context

ADR-0245 lets one plugin default apply when an application schema omits a direct
option, while an explicit `false` disables that behavior. Existing schema
selectors can match option presence or JSON equality, but cannot select
omission. A plugin with an enabled default therefore cannot contribute exact
schema fields or application surfaces without also targeting explicit opt-outs.

Plugin privilege policy and capability composition intentionally complete before
schema declaration and compilation. The final effective schema modes therefore
cannot retroactively alter a plugin manifest or the declaration capability
graph. Requiring privileges or providers only after inspecting those modes would
introduce a second mutable security and composition phase.

## Decision

### Direct-option absence is one callback-free selector

`SchemaSelectorOptions.option` gains the exact form:

```ts
schemas.select({
	owner: { kind: 'application' },
	option: { name: 'softDelete', present: false },
})
```

It selects candidates on which the normalized direct option is absent. The
existing `{ name }` presence selector and `{ name, equals, path? }` equality
selector retain their semantics. `present: true`, combinations with `equals` or
`path`, callbacks, arbitrary predicates, boolean combinators, and general
negation are rejected.

The option name must still resolve to one exact definition for the selecting
plugin. Unknown or ambiguous ownership fails before setup effects. Selection is
encoded into the callback-free schema compiler input and frozen before the
selecting plugin's patches exactly like existing selectors. The schema compiler
protocol advances because compatible replacement compilers must implement the
new matching rule rather than silently treating it as presence.

An enabled plugin default can now contribute separately to schemas with an
explicit matching value and schemas with no direct option. Explicit `false` and
another direct mode remain outside the absence selection.

### Manifests describe potential powers, contributions describe effective use

A plugin manifest declares the smallest fixed set of Core privileges and
capability relationships that any accepted configuration of that plugin
instance may exercise. The set is evaluated and reported before schema
compilation and is not rewritten from effective schema targets.

Application-local providers may compile an empty immutable plan when no schema
uses their behavior. Declarations, handlers, bindings, patches, constraints, and
persistence effects remain conditional on exact selected schemas. A fixed
manifest must not request neighboring or speculative powers outside the closed
implemented feature contract.

For the official soft-delete plugin this means schema-level opt-in may require
the same truthful potential privilege set even when `defaultMode` is
`disabled`. Disabled schemas still receive no tombstone, mutation, constraint,
transport binding, or persistence rewrite.

## Consequences

- Plugin defaults and direct opt-outs compose without a mutable selector
  callback or plugin-level schema allowlist.
- Replacement schema compilers receive one new portable selector fact and must
  advertise the advanced protocol.
- Privilege diagnostics remain early, deterministic, and conservative about
  powers that direct schema options may activate.
- Capability composition remains a single immutable pre-compilation graph;
  empty application-local plans are allowed but hidden behavior is not.

## Non-goals

- General selector negation, disjunction, callbacks, or an expression language.
- Recomputing manifests, privilege policy, plugin order, or capabilities after
  schema compilation.
- Treating absence as a normalized option value or writing inherited defaults
  into developer schema declarations.
- Adding soft-delete vocabulary or behavior to Core.
