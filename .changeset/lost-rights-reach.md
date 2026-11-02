---
'ultimabase': patch
'@ultimabase/postgres': patch
'@ultimabase/realtime': patch
'@ultimabase/testing': patch
---

A lost right re-checks only the live reads it may reach (D-196). A delete in the feed tells the stored `one` keys of each deleted row, and a write through a read rule's relation is judged by that level's own conditions: with 10 000 subscribers, a deleted member row or a user leaving a role costs 4 statements instead of 10 000 to 20 000, and the engine is done in under 190 ms instead of 3.6 to 7.4 s. The subscriber who loses rows hears of it after about 150 to 190 ms instead of 65 to 75.
