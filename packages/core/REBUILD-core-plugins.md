# Core rebuild: `core-plugins` partition

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope (relative to `packages/core/src`): `plugins/**`, `application/**`,
`errors/**`, `foundation.ts`, `index.ts`.

Status: IN PROGRESS (checkpoint). The interrupted WIP commit of the previous
agent was kept: after fixing two compile errors it built and passed the Core
unit and type suites, and a line-by-line review against `main` found it
faithful (see "WIP review").

## WIP review

Fixes applied on top of the interrupted WIP:

- `errors/framework-error.ts`: removed a stale import of the deleted
  `public-error-state.js` (the module had been merged into this file).
- `plugins/manifest.ts`: `pluginContributionOwner` spread an optional
  `instanceId` that `exactOptionalPropertyTypes` rejects; it now copies the
  identity fields explicitly (same keys, same order).
- `plugins/capability-host.ts`: provider contributions of an inactive
  requirement are again the shared frozen empty array (the WIP returned a fresh
  mutable `[]`). The typed `assertApplicationResource` assertion was restored
  (the inlined version produced unsafe `Function` calls).
- `plugins/plugin.ts`: the compiled `commands` plan is frozen again with
  `immutableRecord`, as in the reference.
- `plugins/plugin-command-materializer.ts`: deleted; the WIP had inlined it
  into `capability-host.ts` and left it unused.
- `plugins/constraint-compilers.ts`: the registry no longer passes an unbound
  reader method (lint `unbound-method`).
