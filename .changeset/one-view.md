---
'ultimabase': minor
'@ultimabase/postgres': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
'@ultimabase/testing': minor
---

A `one` view reads the one row of a one-to-many `many` that its filter keeps,
or `null` (D-240): `upcoming: f.one(() => Volume, { from: 'volumes' })`,
filtered in `.with({ relations: { upcoming: { where: ({ where }) =>
where({ released: false }) } } })`. The filter runs once, at startup, and
reads no caller; a unique index on the target's key, with a `where` the
filter keeps, must hold the row single, or the application does not start.
The view is read like a `one`, by include, select and `is`, `isNot` and
`is: null`; it is not written and sorts nothing. GraphQL publishes it as a
nullable field, and OpenAPI leaves it out of inputs and `orderBy`. The
memory adapter's include of a `one` with a filter reads the first row it
keeps.
