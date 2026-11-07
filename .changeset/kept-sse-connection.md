---
'@ultimabase/rest': patch
---

A live list over Server-Sent Events, kept 10 seconds for a resume once its client left, no longer holds the client's closed connection and its gzip stream: about 43 KiB a list until then.
