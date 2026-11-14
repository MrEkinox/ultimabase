---
'ultimabase': patch
---

A virtual field's queries no longer run as the plugin command that read its row: read from a soft-delete trash, a virtual that counts the rows counted the trash instead of the rows not deleted.
