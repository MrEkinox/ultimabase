---
'ultimabase': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
---

Every field builder and `defineFunction` take `deprecated`, a non-empty
string that says why clients should stop using it and what replaces it.
GraphQL shows `@deprecated(reason:)` on the field in the model's types and
inputs, on a virtual field and on a function's field; OpenAPI shows
`deprecated: true` with the reason ending the description. Only a field a
create may leave out is deprecated: on a required one, `deprecated` fails to
compile and stops the start (D-216).
