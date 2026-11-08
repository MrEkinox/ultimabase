---
'ultimabase': minor
'@ultimabase/auth': minor
'@ultimabase/password': minor
---

A plugin's own model relates to the application's user model through `AppUser`: `user: f.one(() => AppUser, { onDelete: 'cascade' })`. Startup resolves it to the model `defineUser` declares, and the user model gains no field. Auth's sessions and linked accounts, and password's hash and tokens, now hold their user this way: the database's foreign key deletes them with their user, and the column `user_id` replaces `userId`. Delete the rows whose user no longer exists before migrating.
