---
'@ultimabase/roles': patch
---

Only Master creates, updates or deletes a role, whatever the role model's `access` allows: any other caller gets `ACCESS_DENIED`, `Role update refused.`, logged with its `callerId`. A client allowed to update roles could rename `Admin` away and its own role to `Admin`, and `hasRole` matches by name. The role model's `access` now decides reads; an admin screen writes roles through a function that writes as Master.
