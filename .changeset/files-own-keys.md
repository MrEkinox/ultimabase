---
'@ultimabase/files': patch
---

`files.check({ delete: true })` on `s3()` deletes only objects files wrote. It listed the whole bucket, so it deleted every other object in it, a backup next to the uploads included; `s3()` now lists only `public/` and `private/` keys.
