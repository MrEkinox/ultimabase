---
'@ultimabase/graphql': patch
---

The documents a server keeps parsed hold 256 KB of text at most: 500 dense documents of 4 KB, sent by an anonymous client and refused, held 420 MB of heap in every process; they now hold 55 MB at most.
