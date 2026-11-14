---
'ultimabase': minor
'@ultimabase/soft-delete': patch
---

A redirected delete is given every row it removes, `where: { id: { in: ids } }`,
in one call per model: a plugin writes them with `updateMany`, and a
`deleteMany` into the trash makes one write, not one per row.
