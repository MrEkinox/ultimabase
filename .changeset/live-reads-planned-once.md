---
'ultimabase': patch
'@ultimabase/realtime': patch
---

A live read plans its rows' read once per caller, its read rules and `beforeFind` included, instead of on every write it follows: a write followed by 10 000 subscribers on one list sends its last message in about 165 ms instead of 260 (D-195).
