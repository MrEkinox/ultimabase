---
'@ultimabase/files': patch
---

An upload with variants writes two `FilesBlob` rows at most, and none when a variant or an inline value fails.
