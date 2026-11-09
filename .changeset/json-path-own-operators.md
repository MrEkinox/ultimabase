---
'ultimabase': patch
---

A json path filter refuses `constructor`, `toString` or `__proto__` as an operator with `INVALID_QUERY`, as any unknown operator; they used to select wrong rows or fail with a server error.
