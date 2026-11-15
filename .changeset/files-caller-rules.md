---
'@ultimabase/files': minor
---

A file field's `maxSize` and `accept` take a function of the caller, sync or async, and its new `check({ body, type, name, caller })` refuses a file once read, before anything is stored (D-402). A plan decides what a user uploads: `maxSize: async ({ caller }) => ((await isSubscribed(caller)) ? 50 * MB : 5 * MB)` refuses a free user's 50 MB before the body is read, and `check` refuses what the application decides, such as an animated image, with the `PublicError` it throws.
