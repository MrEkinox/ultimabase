---
'ultimabase': minor
---

`f.exists(target, { from, readRule: false })` reads whether its view keeps a row the caller cannot read, as a user blocked by someone whose blocks only they read. Only the boolean tells; the target's `beforeFind` still applies, and a `many` or `one` view refuses `readRule`.
