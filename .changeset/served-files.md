---
'@ultimabase/files': minor
---

`diskFiles({ dir, secret })` stores the files in a directory, for one server with a persistent volume, and `memoryFiles()` now gives real URLs: the application serves both at `GET /files/<key>`, a private file at a signed URL, sandboxed and never sniffed (D-202).
