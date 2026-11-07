---
'@ultimabase/password': patch
---

A burst of sign-ins no longer holds up the rest of the server: no more Argon2 computations run at once than libuv has threads (4 by default), so a compressed realtime message or a file read no longer waits behind a queue of them. During 400 sign-ins, a live list was told of its writes at p50 53 ms instead of 1350 ms, and the sign-ins took about as long (3.5 s instead of 3.4 s).
