---
'ultimabase': minor
---

`definePlugin` takes no `manifest` for a plugin of the application: its
versions are not checked and it logs no warning. A published plugin still
passes its `package.json` (D-172).
