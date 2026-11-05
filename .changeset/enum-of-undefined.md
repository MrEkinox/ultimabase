---
'ultimabase': patch
---

`f.enumOf(undefined)` names its likely cause: two model files importing each
other, one reading the other's values before they are defined.
