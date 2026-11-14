---
'@ultimabase/http': minor
'@ultimabase/maintenance': patch
---

The maintenance ends the open event streams as it begins: a live list's
stream no longer goes on serving changes during maintenance. The HTTP plugin's
new `plugins.http.closeStreams()` ends every `text/event-stream` answer.
