---
'@ultimabase/http': patch
---

A request whose headers end once the stop began answers 503 and closes its connection, as `/ready` does: it ran after the plugins it used had stopped. An upgrade is refused the same way, and one whose gate runs when the stop begins is taken before its plugin stops.
