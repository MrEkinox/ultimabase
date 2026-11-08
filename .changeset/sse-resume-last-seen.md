---
'@ultimabase/rest': patch
'@ultimabase/live': patch
---

A live list resumed over Server-Sent Events no longer misses a change written while its connection was being cut. `liveFetch` resumes with the revision it last saw, as `Last-Event-ID`, and the server sends the window whole when that connection lost some of what it was written.
