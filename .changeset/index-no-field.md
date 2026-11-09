---
'ultimabase': patch
---

An index over no field is refused at start, naming its model: PostgreSQL could not create it, and a unique one let `findUnique({ where: {} })` return the first row.
