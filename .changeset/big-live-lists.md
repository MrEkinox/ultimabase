---
'@ultimabase/realtime': minor
---

A live list costs what its readers see, whatever its length. `maxLive` is now 50 000 rows by default, where it was 1000, and `maxConnectionRows` 100 000, where it was 10 000. Nested rows no longer count toward `maxLive`: a nested list is bounded by its `take`. `fetchMore` past `maxLive` is no longer refused: it adds what fits, then `hasNextPage` is `false`. A connection past `maxConnectionRows` still refuses the growth.

A write in a read's reach no longer sends the rows that did not change. The read still reads them again, and a page-mode read still resends its window.
