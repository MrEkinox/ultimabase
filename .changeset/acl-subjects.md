---
'@ultimabase/acl': patch
---

An `ACL` method given a user or a role whose id is empty or holds a line
break throws a `TypeError`: such an entry was stored, then made every read
of its model throw. The `acl` field also refuses an array (D-124).
