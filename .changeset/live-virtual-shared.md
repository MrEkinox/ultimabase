---
'ultimabase': patch
'@ultimabase/realtime': patch
---

Subscribers whose virtual fields read the same thing share one statement during a change: 1000 subscribers on one list went from 1002 statements a write to 3, and the last of them hears 53 % sooner.
