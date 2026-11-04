---
'ultimabase': minor
'@ultimabase/http': patch
---

A `many` facing a `one` takes `size: { min, max }` (D-242): each parent a
write or a transaction touches holds `min` to `max` rows at its end, or the
write is refused with `RELATION_SIZE`, `details: { model, field, id, min,
max, size }`, and nothing of it is kept. Every path counts: nested and bulk
writes, moves from either side, deletes, cascades and `setNull`; deleting
the parent is never refused by its own bound. Each write locks the parents
it touches, so concurrent writes cannot pass the bound together. A
many-to-many or a view with a `size` is refused by the types and at startup.
HTTP sends `RELATION_SIZE` as 409, and the GraphQL and OpenAPI schemas state
the bound in the field's description: `Holds 2 to 4 rows.`
