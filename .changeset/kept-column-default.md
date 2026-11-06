---
'@ultimabase/postgres': minor
'ultimabase': minor
---

A required field added with a fixed default now keeps it as its column's default, where the plan dropped it in the same transaction. Code still running without the field can then still insert during a rolling deploy. A list without a default keeps `'{}'`. A change of the column's type drops the default. `migrate create` writes a comment below an added list that no default fills, so that the file says the stored rows hold it empty: `-- The stored rows hold an empty "Account.languages": fill them here if the model needs a value.`
