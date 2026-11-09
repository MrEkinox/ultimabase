---
'@ultimabase/graphql': patch
---

A variable's value outside its enum is no longer sent back in the error: `Value "secretpw" does not exist in "PostStatus" enum.` is now `The value does not exist in "PostStatus" enum.`, as every other refused value already was.
