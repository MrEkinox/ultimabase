# ADR-0150: Instance command result selections

- Status: accepted
- Date: 2026-08-06

## Context

Static schema mutations accept an exact `select` object and infer the visible
shape of their returned models. Immutable model commands executed the same
Runtime operations, but always returned the complete Access-permitted model.
Their execution options also occupied the first argument for `create` and
`delete`, while `update` accepted raw update data directly.

That asymmetry prevented a developer from controlling mutation results after a
model had already captured draft data or protected persisted identity.

The draft upsert contract also typed `where` as the shared `SchemaWhereFactory`
while its runtime boundary accepted only callback builders. Object `where`
inputs must behave consistently across every query and mutation surface.

## Decision

Every immutable model command uses a command envelope followed by optional
terminal execution options:

```ts
await draft.create({ select }, options)
await draft.upsert({ where, update, select }, options)
await model.update({ data, select }, options)
await model.delete({ select }, options)
```

An empty envelope selects the complete result:

```ts
await draft.create({}, options)
await model.delete({}, options)
```

Literal selections infer the same flat visible result shape as static schema
mutations. Runtime retains protected persisted identity independently, so an
omitted `id` never prevents later instance updates, deletion, or relation
commands.

Instance upsert accepts both object `where` inputs and `WhereBuilder` callbacks,
matching every other operation that consumes `SchemaWhereFactory`.

This is a hard development-stage migration. The former argument shapes are not
kept as overloads or aliases.

## Consequences

- Every mutation surface shares one command-envelope convention.
- Instance mutation results can avoid returning unused fields without an extra
  database read.
- TypeScript rejects unknown fields, dynamic selection booleans, and legacy
  instance update shapes.
- Existing instance calls must pass `{}` when they need no command input and
  move execution options to the second argument.
- Transports still normalize into the same operation AST; this decision adds no
  Core dependency on a database or transport.
