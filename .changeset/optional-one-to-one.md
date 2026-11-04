---
'ultimabase': minor
---

A one-to-one may be optional on both sides: the side that names `onDelete`
stores a unique key that may be empty, and `create`, `connect` and
`disconnect` from the other side move it (D-233). Startup stops when neither
side names `onDelete`, or both do.
