---
'@ultimabase/password': patch
---

Requests at once keep one pending token of each kind per user, as a new one replaces the older. A unique index on `PasswordToken` (`userId`, `kind`) enforces it: run a migration after the upgrade.
