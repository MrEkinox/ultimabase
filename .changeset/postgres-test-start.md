---
'@ultimabase/postgres': patch
---

A test on the declared `postgres()` database starts faster: one `delete` empties the test file's tables instead of a `truncate`, and a start no longer creates the schema it already found. A 22-model application starts and stops around a test in 44 ms, where it took 60 ms.
