---
'@ultimabase/postgres': patch
---

An `in` or `notIn` of more than 65535 values, and a many-to-many `connect` or `disconnect` of more than 32767 targets, no longer fail with `bind message has … parameter formats but 0 parameters`: a list of values is one parameter. Reads by lists of ids of changing length, as the realtime engine makes them, are planned once: 12 to 14 % faster for lists of a few hundred ids.
