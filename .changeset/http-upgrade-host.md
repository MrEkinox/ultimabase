---
'@ultimabase/http': patch
---

An upgrade whose `Host` header holds a path or a query, such as `localhost/admin?`, is refused with 400: it picked the plugin of that path, whatever path the request named.
