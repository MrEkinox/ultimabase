---
'ultimabase': minor
'@ultimabase/postgres': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
---

`f.oneOf({ post: () => Post, photo: () => Photo }, options)` declares a
relation to one row of one of its kinds, each kind's model naming it back
from a `many`. A row reads `{ kind: 'photo', photo: { ... } }`, which
TypeScript narrows on `kind`; a write names its kind, as
`{ connect: { photo: { id } } }`; a `where` filters through a kind, through
the fields every kind shares, or by `kind`. `postgres()` stores a foreign key
per kind and a check that one is set. GraphQL serves an object type,
`CommentTarget { kind, post, photo }`, with its filter and `@oneOf` inputs;
REST and OpenAPI take and type the same shapes; live queries follow it
(D-247).
