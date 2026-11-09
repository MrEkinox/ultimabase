---
'@ultimabase/rest': patch
'@ultimabase/realtime': patch
---

An SSE resume checks its read and its user before it ends the stream still open for its token (D-154): another user's request, or another read, carrying that token starts afresh and leaves the list streaming and kept. The realtime API gains `sameUser(viewer, request)` for the transports.
