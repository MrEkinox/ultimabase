---
'@ultimabase/http': patch
---

A preflight's answer says `access-control-max-age: 600`: a browser keeps it 10 minutes instead of 5 seconds, its default, and stops sending a preflight before almost every call from another origin.
