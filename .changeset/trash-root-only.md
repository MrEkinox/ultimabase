---
'ultimabase': patch
'@ultimabase/soft-delete': patch
---

A plugin's command applies to the rows it reads, not to the rows under them: `Post.trash.findMany({ include: { author: true } })` reads the author as any read does, where a deleted post's live parent read `null` before.
