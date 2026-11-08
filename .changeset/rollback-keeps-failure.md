---
'ultimabase': patch
---

A transaction whose database connection is lost rejects with the error that failed it, no longer with the error of the ROLLBACK the dead connection refuses: an error the callback throws, such as a `PublicError`, keeps its code.
