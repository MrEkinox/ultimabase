---
'@ultimabase/files': minor
---

`@ultimabase/files/client` uploads files from a browser: `uploader({ url,
headers })` gives `upload(file, { for })`, which resolves to the id to write
in a row, or `upload(files, { for })` for a list. A refused upload rejects
with a `FileError` carrying the server's `code`, `message` and `details`. It
imports nothing of the server, whose packages become optional peers.
