# ADR-0147: Set-based mutation returning selections

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0132, ADR-0144, ADR-0146
- Refined by: ADR-0164

ADR-0164 retains flat result selections, identifier-only default projections,
and ordered model arrays, but replaces the set-based statement and
operation-level hook lifecycle below with atomic item-oriented execution.

## Context

`updateMany` and `deleteMany` historically returned only an affected-row count.
PostgreSQL and Drizzle can return selected values from every affected row in the
same set-based `UPDATE` or `DELETE` statement. Requiring a follow-up read loses
delete preimages and introduces a race for updated values.

Returning complete rows by default would make an accidentally broad mutation
produce an unnecessarily large payload. Materializing each affected row for
mutation hooks would also replace the established set-based lifecycle with an
itemized one.

## Decision

Both commands accept the flat selection contract shared by Query and singular
mutations:

```ts
const updated = await Post.updateMany({
	where: { published: { eq: false } },
	data: { published: true },
	select: { id: true, published: true },
})

const deleted = await Post.deleteMany({
	where: { archived: { eq: true } },
	select: { id: true, title: true },
})
```

They always return an immutable model array. Omitting `select` installs the
implicit selection `{ id: true }`; callers obtain the affected-row count from
the array length. `updateMany` returns post-update values and `deleteMany`
returns pre-delete values.

The PostgreSQL plugin compiles the selection through Drizzle `returning()` on
the existing set-based statement. Runtime validates the selected records and
runs ordinary field output resolution. It does not create mutation
materializations or execute per-object before, after, save, delete, or change
hooks. Schema and global operation hooks still run once.

## Consequences

- Bulk callers can correlate affected identifiers without a second query.
- Explicit projections remain typed and portable through the Query AST.
- Broad mutations keep a small identifier-only default payload.
- Set-based mutation lifecycle and transaction behavior remain unchanged.
- Database adapters must return selected record arrays for these operations.
