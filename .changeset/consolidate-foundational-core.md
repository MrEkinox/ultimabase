---
'@ultimabase/core': major
'@ultimabase/acl-permissions-plugin': patch
'@ultimabase/graphql-plugin': patch
'@ultimabase/graphql-yoga-plugin': patch
'@ultimabase/pg-vector-plugin': patch
'@ultimabase/postgres-plugin': patch
'@ultimabase/postgres-migrations-plugin': patch
'@ultimabase/rest-plugin': patch
'@ultimabase/roles-plugin': patch
'@ultimabase/server-hono-plugin': patch
'@ultimabase/testing': patch
---

Consolidate Schema, Query, Access, application orchestration, and Runtime under
the single `@ultimabase/core` public entry point. Official plugins now depend on
that cohesive foundational package instead of synchronized internal packages.
