---
'@ultimabase/access-plugin': major
---

Make detailed schema read decisions sparse, add granular static operation
defaults, resolve exact schema decisions before those defaults, and keep plugin
contributions deny-only. Unconfigured operations deny while undeclared fields
remain available until an exact policy narrows them.
