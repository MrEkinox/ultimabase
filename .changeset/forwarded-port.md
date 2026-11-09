---
'@ultimabase/http': patch
---

An `X-Forwarded-For` entry with the port a proxy appended counts as its address: `203.0.113.7:5678` is `203.0.113.7`, `[2001:db8::1]:443` is `2001:db8::1`. Such an entry counted as the proxy's connection, so every client behind it shared one rate limit: 50 requests from one client over a limit of 2 were refused 0 times, now 48.
