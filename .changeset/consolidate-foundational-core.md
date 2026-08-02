---
'@ultimabase/core': major
'@ultimabase/acl-permissions': patch
'@ultimabase/clp-permissions': patch
'@ultimabase/field-permissions': patch
'@ultimabase/graphql': patch
'@ultimabase/graphql-yoga': patch
'@ultimabase/pg-vector-plugin': patch
'@ultimabase/postgres': patch
'@ultimabase/postgres-migrations': patch
'@ultimabase/rest': patch
'@ultimabase/roles': patch
'@ultimabase/server-hono': patch
'@ultimabase/testing': patch
---

Consolidate Schema, Query, Access, application orchestration, and Runtime under
the single `@ultimabase/core` public entry point. Official plugins now depend on
that cohesive foundational package instead of synchronized internal packages.
