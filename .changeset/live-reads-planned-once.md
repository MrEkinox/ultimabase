---
'ultimabase': patch
'@ultimabase/realtime': patch
---

A live read plans its rows' read once per caller, its read rules and `beforeFind` included, instead of on every write it follows, opens with one query of the fields it needs, and keeps each row as its sort keys alone (D-195). A write followed by 10 000 subscribers on one list of 25 rows sends its last message in about 155 ms instead of 260; a subscription to 1000 rows holds 163 KiB instead of 305, and 10 000 of them open in 28.5 s instead of 54.
