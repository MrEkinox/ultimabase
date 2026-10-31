---
'ultimabase': minor
'@ultimabase/postgres': minor
'@ultimabase/testing': minor
'@ultimabase/http': patch
---

`transaction(run, { isolation: 'serializable' })` runs a serializable transaction, and runs `run` again when the database aborts it for a conflict with another, 3 attempts at most; the third conflict fails with the new code `CONFLICT`, status 409 over HTTP (D-179). An adapter's `begin` takes `{ isolation: 'serializable' }`, throws when it cannot hold it, and reports a conflict as `Conflict`: PostgreSQL reports `40001` and `40P01`. `testAdapter` checks that two serializable transactions reading what the other writes never both commit.
