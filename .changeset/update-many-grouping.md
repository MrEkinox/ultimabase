---
'ultimabase': patch
---

An `updateMany` whose `beforeUpdate` hook stamps each row with a date stays linear: 8,000 rows went
from about 3 s to 60 ms.
