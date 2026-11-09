---
'ultimabase': minor
'@ultimabase/postgres': minor
---

Two `migrate deploy` of different code at the same time no longer leave the older snapshot stored,
which made every production start refuse: the deploy that read the database before the other ran
is refused with `Another deploy changed the database meanwhile: deploy again.`, and applies no file
of its own after the other's. Identical deploys, such as replicas deploying at start, still pass.

For adapter authors: a deploy `Run` holds `known`, every file name the code holds. `apply` refuses
the deploy, under its lock, when the database applied a file `known` does not name.
