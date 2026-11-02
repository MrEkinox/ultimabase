---
'ultimabase': minor
'@ultimabase/graphql': minor
---

`ultimabase generate` writes the files plugins declare with the new `generate` hook, without starting the database or opening a port; `--check` exits 1 when one is out of date, for CI. The GraphQL plugin's `generated` schema file goes through it, and `ultimabase dev` now logs `Wrote <path>.` for it (D-201).
