# ADR-0293: Let Access row filters deny explicitly and stop teaching open defaults

- Status: accepted
- Date: 2026-10-08
- Refines: the official Access plugin row-filter contract; applies ADR-0288
- Approval: user validated on 2026-10-08
- Implementation: with the developer-API challenge (`docs/handoff/api-challenge-plan.md`)

## Context

An Access `where` callback returns `undefined` (no additional row filter), a
`WhereInput` or a `WhereBuilder`. Returning `undefined` is useful: "administrators
see every row, others only their own". The operation decision itself comes from
`allow`; without an `allow` rule the plugin default applies, and that default
denies (`packages/access-plugin/README.md`, "Defaults").

The trap is `accessPlugin({ default: true })`, which the Access README and both
examples teach. With it, `update: { where: ({ context }) => user ? where.eq('owner', user.id) : undefined }`
lets an anonymous request update every row: the default allows the
operation and `undefined` adds no filter
(`packages/access-plugin/src/runtime/rule-evaluation.ts`).

## Decision

- `undefined` keeps meaning "no additional row filter".
- A `where` callback may also return `false`, meaning "no row": the developer
  can write `user ? where.eq('owner', user.id) : false`.
- Documentation and examples stop presenting `default: true` as the normal
  setup. They show explicit `allow` rules and state precisely what an open
  default opens.

## Consequences

The safe default (deny) is unchanged. Row filters gain an explicit way to
exclude every row without composing an impossible predicate. The final shape
of Access rules may still change in the developer-API challenge; these
semantics carry over.
