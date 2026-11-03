---
'@ultimabase/password': patch
---

A new password deletes the pending email-change link, a reset or verification link sent to an email the account has left fails, and a sign-in that raced `setPassword` inside an application's transaction ends once it commits (D-212).
