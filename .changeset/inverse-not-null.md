---
'@ultimabase/postgres': patch
---

A filter on an optional inverse relation, as `featuredBy: { isNot: null }` inside an `OR`, no longer reads every row of the other table. A read of 25 campaigns under such a rule went from 4.6 to 3.5 ms with 20 000 users, and from 12.4 to 3.5 ms with 100 000.
