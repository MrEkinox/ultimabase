---
'ultimabase': minor
---

A non-unique index names `id`, `createdAt` and `updatedAt`, as `indexes: [{ fields: ['room', 'createdAt', 'id'] }]`; a unique index still refuses them (D-174).
