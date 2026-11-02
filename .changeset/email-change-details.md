---
'@ultimabase/password': patch
---

`requestEmailChange` refuses a taken email with the details of a sign-up,
`{ model: 'User', fields: ['email'] }`.
