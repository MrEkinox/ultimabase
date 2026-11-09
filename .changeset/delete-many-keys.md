---
'@ultimabase/postgres': patch
---

A delete on a model of more than 99 stored keys, or of long key names, no
longer fails: its change then tells the ids alone.
