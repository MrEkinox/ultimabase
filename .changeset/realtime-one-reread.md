---
'@ultimabase/realtime': patch
---

A live list asked to read its whole window again several times before that read began reads it once: a slow read no longer queues one more full read of a large window for each missed flush or `resend()`.
