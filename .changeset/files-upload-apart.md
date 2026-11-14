---
'@ultimabase/files': patch
'ultimabase': patch
---

An upload inside a transaction that rolls back no longer leaves its objects in storage for good:
its rows are written apart from that transaction, so the sweep deletes them within the hour.
