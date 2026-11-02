---
'@ultimabase/password': minor
---

The email flows are commands on the user model for server code and tests:
`User.requestPasswordReset({ email })`, `User.resetPassword({ token, password })`,
`User.verifyEmail({ token })`, `User.sendVerificationEmail({ id })`,
`User.requestEmailChange({ id, newEmail })` and
`User.confirmEmailChange({ token })`. Each runs its function's code and
resolves once the email has left.
