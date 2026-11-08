---
'@ultimabase/postgres': patch
---

A query that binds more than 65535 values, such as an `OR` of 70000 conditions, now fails saying so and how to write it, instead of with `bind message has … parameter formats but 0 parameters`.
