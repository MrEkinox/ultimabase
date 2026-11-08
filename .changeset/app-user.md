---
'ultimabase': minor
'@ultimabase/auth': minor
'@ultimabase/password': minor
---

A plugin's own model relates to the application's user model through `AppUser`: `user: f.one(() => AppUser, { onDelete: 'cascade' })`. Startup resolves it to the model `defineUser` declares, and the user model gains no field. Auth's sessions and linked accounts, and password's hash and tokens, now hold their user this way, and the column `user_id` becomes a `uuid` with a foreign key to the user. Deleting a user through UltimaBase deletes them in its transaction. The foreign key does not cascade, since the kernel runs the cascades (D-54): a delete in raw SQL deletes them first, or fails at commit. Before `migrate deploy`, delete the rows whose user no longer exists, or the cast to `uuid` and the foreign key fail; with the user model stored in `"user"`:

```sql
delete from "auth_session" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
delete from "auth_account" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
delete from "password_hash" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
delete from "password_token" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
```
