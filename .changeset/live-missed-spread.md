---
'@ultimabase/realtime': patch
---

When the database's change feed reconnects, live reads no longer stop until every one of them was read again. The viewers read again 32 at a time, with the writes' messages in between. With 10 000 connected callers, a lost listening connection stopped every live read for up to 40 s.
