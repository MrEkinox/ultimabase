---
'@ultimabase/realtime': minor
---

`viewer.onClose(listener)` runs once a viewer closes, whatever closes it: its caller ended, the application stopped or `close()` was called. A plugin's own socket closes there.
