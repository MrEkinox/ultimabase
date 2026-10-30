---
'@ultimabase/password': minor
---

`User.checkPassword({ id, password }, { as, client })` checks the current password before a sensitive action, opens no session, and is counted per user even without a client. A wrong current password, here and in `changePassword`, now answers `Wrong password.`
