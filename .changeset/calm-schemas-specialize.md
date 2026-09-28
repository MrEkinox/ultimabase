---
'@ultimabase/core': minor
'@ultimabase/password-auth-plugin': patch
'@ultimabase/roles-plugin': patch
---

Replace the two schema-specialization construction paths with the single typed
`Schema.defineSpecialized()` boundary and migrate Password User and Role schema
factories without changing their application-facing contracts.
