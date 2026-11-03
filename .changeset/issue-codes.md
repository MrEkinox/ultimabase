---
'ultimabase': patch
'@ultimabase/password': patch
---

A schema's issue keeps its code when it is in capitals, as `NAME_LENGTH`;
a library's, as Zod's `too_small`, is left out. The password's refusals
carry `PASSWORD_LENGTH`, `PASSWORD_IS_EMAIL` and `PASSWORD_BREACHED`, and
within a function they share the input's path, as
`['input', 'newPassword']` (D-224).
