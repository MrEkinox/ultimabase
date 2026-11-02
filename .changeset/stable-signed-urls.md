---
'@ultimabase/files': patch
---

A private file's URL stays the same for 15 minutes: `s3()` signs it with the start of its 15-minute window and an expiry of 30 minutes, so a row read again, as a live read resends it, keeps its URLs (D-200).
