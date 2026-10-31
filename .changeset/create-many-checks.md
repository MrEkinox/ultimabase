---
'ultimabase': patch
---

`createMany` checks the rows its records connect in one count per target model, so thousands of rows with a `connect` no longer fail on PostgreSQL with "target lists can have at most 1664 entries".
