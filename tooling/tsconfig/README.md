# @ultimabase/tsconfig

Shared strict TypeScript configuration for UltimaBase packages.

- `base.json` defines production compiler rules.
- `test.json` adds Vitest and Node types for package-local and cross-package tests.

Package `tsconfig.test.json` files override the shared root include list with
local source tests and package tests. Declaration support lives in explicit
fixtures rather than relying on another workspace's executable type tests.
