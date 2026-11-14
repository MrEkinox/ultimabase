---
'create-ultimabase': patch
---

Ctrl+C at the question ends quietly, and a directory it cannot write fails with one line. The `cd` it prints uses single quotes, so `!` survives zsh; a leading `~` is the home directory; `node_modules`, `favicon.ico` and Node's module names are refused.
