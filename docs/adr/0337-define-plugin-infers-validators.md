# ADR-0337: definePlugin infers rule validators

- Status: accepted
- Date: 2026-10-14
- Refines: the plugin-kit `definePlugin` record, ADR-0335; applies ADR-0288
- Approval: chosen by the user on 2026-10-14

## Context

`definePlugin` inferred its rule values through the mapped type
`rules?: { [K in keyof TRules]: Validator<TRules[K]> }`. TypeScript infers that as a reverse mapped
type, which it treats as possibly generic and re-instantiates without caching inside every
enclosing instantiation. In an application that declares `Register`, the `.with` chain then goes
past TypeScript's depth limit: TS2589 at `App.Schema.define`. Annotating the factory's return type
with `DefinedPlugin<…>` was the only workaround, and the documentation had to explain it.

## Decision

1. `definePlugin` infers the `rules` object of validators itself and derives each rule value from
   its validator's result type. The third type parameter of `definePlugin` and of
   `DefinePluginOptions` is therefore the validators record, not the rule values.
2. The resulting plugin type does not change, and neither does `DefinedPlugin`. No export is
   added or removed.
3. A case in `tests/register-cycle/defined-plugin` guards this on TypeScript 6 and 7, from
   sources and from built packages: unannotated factories with rules, fields, statics and
   commands, installed in a registered application.

## Consequences

- Plugin factories need no return annotation. The workaround is removed from
  `examples/plugin-authoring`, the plugin-kit README and the build-a-plugin page.
- A hover on a `rules` entry shows the validator's own type.
- Documentation impact: both.
