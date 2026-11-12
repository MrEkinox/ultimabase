---
'@ultimabase/files': minor
---

`files.refresh('Post.cover', { as: master })` gives the files stored before a key was added to `inline` or `variants` that key: it runs only the missing functions on each body, stores the values and variants as an upload does, and writes the file again in its row without the model's hooks, keeping `updatedAt`, so live reads see it. It returns `{ refreshed, failed }`; a file whose body is gone or whose row changed meanwhile is in `failed`, and the next call takes it again.
