---
'@ultimabase/password': minor
---

Breaking: `sendEmail` receives `user`, the user's row with every field, in place of `userId`; read `email.user.id` for the id. The row is read as Master just before the email goes, so `sendEmail` greets the user or picks their language without its own `findUnique`. A user deleted before its email goes receives none.
