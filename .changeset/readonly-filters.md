---
'ultimabase': minor
---

A field with `allow.public` or `allow.readOnly` has no read rule: every caller filters, sorts and searches on it, and GraphQL and OpenAPI type it non-null when it is required; writes to it are checked as before (D-176).
