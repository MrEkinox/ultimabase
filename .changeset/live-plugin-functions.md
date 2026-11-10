---
'@ultimabase/realtime': minor
'@ultimabase/rest': patch
---

`realtimePlugin({ liveFunctions })` makes a plugin's query live by its owner name, as
`liveFunctions: ['auth.viewer']`: a subscription to `viewer` sends the signed-in user again when a
write changes them (D-362). REST's refusal of a plugin's query that is not live says to name it
there.
