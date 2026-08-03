---
'@ultimabase/core': minor
'@ultimabase/postgres': minor
---

Execute PostgreSQL create-many, update-many, delete-many, upsert-one, and
upsert-many operations through Runtime's prepared transaction protocol.

Non-atomic create and upsert collections recover failed items through private
PostgreSQL savepoints and return the typed successful-prefix result. Unique
target equality values now seed the create candidate before hooks and reject
contradictory create values.
