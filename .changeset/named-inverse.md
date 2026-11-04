---
'ultimabase': minor
'@ultimabase/roles': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
'@ultimabase/realtime': minor
'@ultimabase/testing': minor
---

A relation's other side is named, never found by itself (D-237). A `one`
without `inverse` stores its key and its target gets no field:
`author: f.one(() => User)` no longer asks `User` for a `many`. A `many`
names its other side with `inverse`, which the types require:
`posts: f.many(() => Post, { inverse: 'author' })`, and both sides of a
many-to-many name each other. In a one-to-one, the optional side names the
other and stores no key; the side it names stores the key. The user model of
`defineRole` lists its roles in
`roles: f.many(() => Role, { inverse: 'members' })`. GraphQL and OpenAPI give
a one-sided `one` its target's whole input, `UserCreateNestedOneInput`.
`StoredRecord` and the types built on it lose their second parameter.
