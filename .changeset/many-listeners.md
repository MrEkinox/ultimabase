---
'@ultimabase/http': patch
---

On Linux, a server takes connections 16 times faster when it is busy: with 2000 clients, the slowest
one waits about 2.5 s instead of about 18 s, and a health probe under 1 s instead of over 5 s.
