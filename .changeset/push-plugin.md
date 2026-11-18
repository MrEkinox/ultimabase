---
'@ultimabase/push': minor
---

New package: `pushPlugin()` sends Web Push notifications to the devices a user signed in on, each
device tied to its session, so a sign-out stops its notifications (D-408). The application's own
functions call `push.register(caller, { web })` and `push.unregister(caller)`, and its jobs call
`push.send(userIds, message)`, which returns `{ sent, gone, failed }`. Encryption and VAPID are
built on `node:crypto`, without a dependency; `npx @ultimabase/push keys` prints a pair of keys, and
`@ultimabase/push/testing` gives `fakeWebPush()`.
