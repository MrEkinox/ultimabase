---
'@ultimabase/files': patch
---

An upload checks `access.upload` before anything else, and answers a refused caller 403 `The upload is refused.` whatever field it names. The rule ran once the body was read, so an anonymous caller had the server buffer up to `maxSize` of a field with variants, learned from 400 and 415 answers which fields exist, and got a 403 that named the internal `FilesBlob` model.
