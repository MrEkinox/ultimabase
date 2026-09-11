# ADR-0157: Explicit relation emptiness filters

- Status: accepted
- Date: 2026-08-07
- Refines: ADR-0118, ADR-0143, ADR-0156
- Refined by: ADR-0247

## Context

A to-many relation is never nullable, so `isNull` and `isNotNull` correctly do
not apply to relation fields. Developers can already express visible
collection emptiness with `none: {}` and non-emptiness with `some: {}`. Those
quantifiers are precise for target predicates, but empty nested objects obscure
the common intent when no target condition exists.

Cardinality comparisons also express the same states with `count: { eq: 0 }`
and `count: { gt: 0 }`, but compiling a count is unnecessary when an existence
test is sufficient.

## Decision

Canonical relation `where` inputs expose two literal flags:

```ts
const withoutTags = await Article.findMany({
	where: { tags: { isEmpty: true } },
})

const withTags = await Article.findMany({
	where: { tags: { isNotEmpty: true } },
})
```

`isEmpty: true` normalizes to `none: {}`. `isNotEmpty: true` normalizes to
`some: {}`. They create no new Query AST nodes or adapter capability. Runtime,
Access, and database adapters therefore observe exactly the existing relation
quantifier semantics over visible targets.

The flags accept only literal `true`, matching the established `isNull` and
`isNotNull` authoring style. `false` is rejected instead of introducing an
implicit inverse vocabulary. `WhereBuilder.isEmpty(field)` and
`WhereBuilder.isNotEmpty(field)` produce the same canonical object inputs and
remain restricted to relation fields.

`some`, `none`, and `every` remain available for nested target predicates.
PostgreSQL continues compiling emptiness through correlated `EXISTS` and
`NOT EXISTS`; it does not use relation cardinality aggregation for these
shortcuts.

## Consequences

- Common empty and non-empty checks communicate intent without empty nested
  predicate objects.
- Transports can expose two explicit boolean flags while normalizing into the
  existing portable AST.
- Source relation field Access and target visibility remain unchanged.
- Contradictory flags or combinations retain the normal implicit `AND`
  behavior of canonical `where` inputs.
