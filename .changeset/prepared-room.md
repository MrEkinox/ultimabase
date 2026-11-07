---
'@ultimabase/postgres': patch
---

A connection keeps prepared the statements it used last. Before, the first 500 kept their room until a restart, so that one visitor sending 500 different filters slowed every later statement by 18 to 38 %.
