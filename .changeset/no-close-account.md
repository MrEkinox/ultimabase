---
'@ultimabase/auth': minor
'@ultimabase/password': minor
---

`User.closeAccount` and `AuthApi.onCloseAccount` are removed (D-211): delete
the user instead, which ends its sessions, unlinks its accounts and deletes
its password, so the email signs up again. `email: null` on a user with a
password account is refused with `email: A password account keeps its
email.`
