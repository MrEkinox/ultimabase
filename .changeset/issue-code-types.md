---
'ultimabase': minor
'@ultimabase/password': patch
---

`IssueCodeOf<typeof app>` types the codes the plugins give a
`VALIDATION_FAILED` issue, which a plugin declares in its types' `issues`.
The password plugin declares `PASSWORD_LENGTH`, `PASSWORD_IS_EMAIL` and
`PASSWORD_BREACHED` (D-231).
