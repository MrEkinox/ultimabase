---
'ultimabase': minor
---

A field with a read rule is optional in the rows a query returns, in a
`select` and an `include` too: `post.title` reads `string | undefined`, as
the row leaves it out when the rule hides it (D-199). `allow.public` and
`allow.readOnly` are no read rule, so their fields stay required.
