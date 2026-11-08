---
'@ultimabase/postgres': patch
---

The change feed checks that it hears its own notifications (D-337). Behind a pooler in transaction mode, such as PgBouncer, it hears nothing: it now logs one error naming the cause, and the caller cache is bypassed instead of kept stale.
