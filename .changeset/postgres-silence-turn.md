---
'@ultimabase/postgres': patch
---

A silent database is given up as soon as its silence is over, where it could wait for the next event on the server: a silence of 1 s cut waiting requests after 3.5 s in the tests, after 1 s now.
