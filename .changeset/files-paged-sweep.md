---
'@ultimabase/files': patch
---

The sweep reads released files 500 at a time and deletes 16 objects at a time, so a sweep after a mass delete no longer sends every deletion at once. A refused deletion keeps only its own row: the rows of the objects deleted are deleted.
