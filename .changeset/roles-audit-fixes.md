---
'ultimabase': patch
'@ultimabase/roles': patch
---

A many-to-many written from its other side runs this side's field rule too,
and only Master gives a role: a user who may edit their own row no longer
becomes an Admin by connecting `roles` (D-213).
