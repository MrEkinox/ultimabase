---
'@ultimabase/http': patch
---

Over the rate limit, an address that sent a wrong master key has its next master-key requests refused until the window ends, without checking or logging each key: 50 guesses past the limit wrote 51 warnings, now 4.
