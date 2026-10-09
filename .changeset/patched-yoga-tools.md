---
'@ultimabase/graphql-yoga-plugin': patch
---

Require `graphql-yoga` 5.24.4 or later so installs resolve `@graphql-tools/utils` 12.0.3, which fixes the `mergeDeep` prototype pollution advisory GHSA-7mx3-vvmw-hjmv.
