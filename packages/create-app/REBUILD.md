# `@ultimabase/create-app` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`. The branch was cut from `c7e2ae6` and
rebased on main `953e832` before the final validation (main did not touch
`packages/create-app`, `yarn.lock` or any `package.json` in between). The
public entry (`src/index.ts`) is unchanged and the emitted `dist/index.d.ts`
and `dist/cli.d.ts` are byte-identical to the reference build. `package.json`
is unchanged (same dependencies, bin and exports). No other package was
edited.

## Production size

Measured with `node tooling/measure-rebuild.mjs .` (non-blank lines):

|        | Lines        |
| ------ | ------------ |
| Before | 1656         |
| After  | 1557         |
| Change | -99 (-6.0 %) |

| Module                 | Before | After |
| ---------------------- | -----: | ----: |
| `api-template.ts`      |    213 |   161 |
| `base-template.ts`     |    343 |   359 |
| `catalog.ts`           |    126 |   142 |
| `cli.ts`               |     63 |    63 |
| `config.ts`            |    198 |   193 |
| `generate.ts`          |    131 |   116 |
| `index.ts`             |     21 |    21 |
| `prompts.ts`           |    329 |   310 |
| `security-template.ts` |    232 |   192 |

Most of what remains is literal generated text (source templates, README
notes, help text, prompt labels) that must stay byte-identical, plus the
`officialPlugins` catalog whose `as const` shape is a public type. Every
module is pinned: `cli.ts`, `prompts.ts`, `catalog.ts`, `base-template.ts`,
`api-template.ts` and `security-template.ts` are listed in website page
`sources` (`quick-start.mdx`, `generate-types.mdx`, `roles.mdx`,
`documentation-plan.json`), and `config.ts`, `generate.ts`, `prompts.ts`,
`base-template.ts` and `catalog.ts` are deep-imported by the internal
`src/*.test.ts` files. Modules were therefore simplified in place, not merged.
`base-template.ts` grew because it now owns the single package.json
dependency order (previously split across three modules) and because the
900-character README behaviour line became a readable condition table.

## Design summary

| Module                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog.ts`           | The prerequisite fixpoint loop that `config.ts` (`resolveSelection`) and `prompts.ts` (`requiredPluginIds`) each copied became one `selectedPluginIds(apis, requested?)`. It does a single pass over a `Set`, which also visits values added during iteration, so it reaches the same closure. `pluginDependencies` and `apiPlugins` became module-private.                                                                                                                                     |
| `config.ts`            | `resolveSelection` uses `selectedPluginIds`; the starter and language defaults are computed once. Same check order, messages, key order and freezing. New shared plan queries `hasPlugin` (replaces the three `has`/`includes` copies of the template modules) and `hasDataApi` (REST or GraphQL schema exposure, previously spelled out seven times), and the `included([[condition, value], ...])` helper that replaces the `...(condition ? [value] : [])` spreads of the multi-entry lists. |
| `prompts.ts`           | `requiredPluginIds` removed (uses `selectedPluginIds`). `missingFlags` is a condition table. `collectSelection` uses one local `choose(given, prompt, fallback)` instead of nine copies of `given ?? (ask ? requiredValue(await prompt()) : fallback)`; prompts are still called lazily and in the same order. `fromClack` became `answer(promise)`; the four `select` prompts and two confirms go through `select(message, options)` and `confirm(message)` with identical clack options.      |
| `api-template.ts`      | One `pluginImports(plan, [[plugin, names], ...])` table helper for plain plugin imports (also used by the security and base templates). REST and GraphQL exposure entries share `exposureEntry`; GraphiQL and Apollo Sandbox share `explorerEntry`. Entries, next commands and README notes are condition tables. `apiDependencies` moved into the base dependency order.                                                                                                                       |
| `security-template.ts` | `needsMasterKey` is one boolean expression; the four repeated combinations became `hasAuth`, `hasProfilePolicy` (Access + Password Auth) and `hasMember` (Roles without Password Auth). Lists are condition tables; `securityDependencies` moved into the base dependency order.                                                                                                                                                                                                                |
| `base-template.ts`     | One ordered `dependencyOrder` list replaces three dependency builders (same package.json key order). Behaviour plugin imports and schema entries come from one `[plugin, factory, entry]` table. `useChain` replaces two copies of the `.use(...)` joiner; `installCommand` was `${manager} install` for every manager and is inlined. The README behaviour notes are a condition table.                                                                                                        |
| `generate.ts`          | The hard-coded `implementedPlugins` set (exactly the 16 catalog ids) is replaced by `isPluginId`; the check and its message are kept. The default installer returns its promise directly. Secrets are generated inline.                                                                                                                                                                                                                                                                         |
| `cli.ts`, `index.ts`   | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Internal exports removed (none was exported from `index.ts` or used outside
its module or by a test): `pluginDependencies`, `apiPlugins`,
`requiredPluginIds`, `formatPlan`, `apiDependencies`, `securityDependencies`.
Internal exports added: `selectedPluginIds`, `hasPlugin`, `hasDataApi`,
`included`, `pluginImports`.

## Parity verification

A scratch oracle (in `node_modules/.cache/rebuild-scratch`, not committed)
bundled the reference sources and the rebuilt sources with esbuild, with
`@clack/prompts` replaced by a recorder, and compared transcripts:

- `parseOptions`: 20 039 argument vectors (random combinations of valid,
  invalid, unknown, positional and conflicting flags): result or error, key
  order included.
- `resolveSelection`: 20 000 random inputs (invalid names, unsafe, existing
  and nested directories, duplicate and unknown APIs/plugins, unchecked
  starters): plan, key order and `Object.isFrozen` of the plan and its arrays,
  or error.
- Every one of the 65 536 requested-plugin subsets x 4 API combinations
  (262 144 plans): plan and the printed `Project plan` note.
- Every one of the 4 096 distinct resolved plugin sets x language x starter
  x database x package manager x install (196 608 renders): every generated
  file, `nextCommands`, the plan note, and the Docker password/Master key
  errors of `renderBaseFiles`.
- `collectSelection`: 1 260 flows (14 option sets x 5 TTY/user-agent
  contexts x 18 adapter scripts including a cancellation at every step and a
  refused confirmation): adapter call order and arguments, result or error
  class and message.
- `terminalPrompts`: 67 cases, the exact clack calls and options (including
  the `validate` results) for normal, cancelled, `undefined` and `false`
  answers.
- `createProject`: 17 scenarios on disk (Docker secrets and `0600` mode,
  secret written after install, install failure rollback, occupied file,
  directory, dangling symlink, destination occupied during install, missing
  and file parents, plugins outside the catalog, the default installer with
  succeeding, failing, signalled and missing package managers): result,
  progress messages, installer calls and the final tree.
- The built CLI (`dist/cli.js`) of both trees, spawned without a TTY on 28
  argument sets (help, unknown flags, missing flags, invalid names, unsafe
  destinations, all API and security combinations, install success and
  failure): exit code, stdout, stderr and the written tree.

All comparisons were identical (0 differences).

## `as` casts

No cast was added. Kept: the two `as const` of `officialPlugins` and
`pluginGroups` in `catalog.ts` (public literal types, unchanged). Removed:
the `as const` of the API dependency id list in `api-template.ts` (the list
is now a typed `readonly PluginId[]`). The new tables are typed by
annotation or contextual typing, not by assertion.

## Removed checks

None. The `implementedPlugins` check of `createProject` is kept in an
equivalent form: the reference set listed exactly the 16 catalog ids (the
catalog test pins the catalog to the shipped `*-plugin` workspaces), so
`!implementedPlugins.has(id)` and `!isPluginId(id)` reject the same values
(only plugin ids outside the catalog, which a typed plan cannot contain), with
the same message. The oracle covers two such hand-built plans.

## Behaviour differences

None observed. One internal note: the `terminalPrompts` methods are no longer
`async` functions; a synchronous throw from a clack prompt factory would now
leave the method synchronously instead of as a rejected promise. The only
caller (`collectSelection`) awaits each method inside an async function, so
the observable result is the same rejected promise, and `terminalPrompts` is
not exported from `index.ts`.

## Test mapping

- No file under `tests/`, no `*.test-d.ts`, no `src/**/*.test.ts` and no test
  outside the package was edited.
- Deep imports used by `src/*.test.ts` keep their paths and names:
  `config.js` (`parseOptions`, `resolveSelection`, `detectPackageManager`),
  `generate.js` (`createProject`), `prompts.js` (`CancelledError`,
  `collectSelection`, `pluginChoices`, `PluginChoice`, `PromptAdapter`),
  `base-template.js` (`nextCommands`, `renderBaseFiles`), `catalog.js`
  (`officialPlugins`). The `tests/e2e` files use only the public entry and the
  packed binary.
- Every `packages/create-app/src` path listed in `apps/website/content`
  still exists.

## Pre-existing failures (untouched tree `c7e2ae6`)

None in the focused suites: `yarn build` passed; `--project unit --project
types packages/create-app` 6 files / 44 tests passed, no type errors;
`--project e2e packages/create-app` 1 file / 6 tests passed (68.3 s);
`--project postgres-e2e packages/create-app` 2 files / 10 tests passed;
`--project website-content` 17 files / 66 tests passed.

## Reference bugs found (documented, not fixed)

- `resolveSelection` validates `apis` and `plugins` for untyped callers but
  not `language`, `starter`, `database` or `packageManager`: a JavaScript
  caller passing `starter: 'x'` gets a plan with `starter: 'x'`, which the
  templates then treat as "not task" in some places and "not empty" in
  others. TypeScript callers and the CLI cannot reach it (the types and
  `parseOptions` reject such values). The rebuild keeps the reference
  behaviour.

## Validation (final tree, rebased on main `953e832`)

| Command                                                                   | Result                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `yarn build`                                                              | pass (before the suites, and again after `tsc --build`) |
| `yarn vitest run --project unit --project types packages/create-app`      | 6 files, 44 tests passed, no type errors                |
| `yarn vitest run --project e2e packages/create-app`                       | 1 file, 6 tests passed (single-plugin test 101.0 s) (1) |
| `yarn vitest run --project postgres-e2e packages/create-app`              | 2 files, 10 tests passed                                |
| `yarn vitest run --project e2e tests/e2e`                                 | 47 files, 219 tests passed                              |
| `yarn vitest run --project postgres-e2e tests/e2e`                        | 55 files, 191 tests passed                              |
| `yarn vitest run --project website-content`                               | 17 files, 66 tests passed                               |
| `yarn test:pack:built`                                                    | 32 files, 173 tests passed                              |
| `yarn eslint packages/create-app`                                         | 0 errors, 0 warnings                                    |
| `yarn prettier --check packages/create-app`                               | pass                                                    |
| `yarn tsc --build packages/create-app`                                    | pass                                                    |
| `yarn tsc -p packages/create-app/tsconfig.test.json`                      | pass                                                    |
| `diff` of `dist/index.d.ts` and `dist/cli.d.ts` with the reference build  | identical                                               |
| parity oracle (module bundles) and CLI oracle (built binaries), see above | 0 differences                                           |

(1) Load average 54.6 at start, 31.5 at the end of that run.

### `create-app-packed` "writes a valid graph for each official plugin selected alone"

Run alone (`-t "each official plugin selected alone"`). The A/B runs used
the same rebased, built tree and only swapped `packages/create-app/dist`
between the reference build and the rebuilt one, alternately:

| Run | Tree                 | Load (1 min) before / after | Duration | Result |
| --- | -------------------- | --------------------------- | -------: | ------ |
| 0   | reference, `c7e2ae6` | 31.6 / 25.8                 |   62.8 s | pass   |
| 1   | rebuilt              | 25.7 / 19.1                 |   62.1 s | pass   |
| 2   | reference `dist`     | 19.1 / 27.3                 |   84.8 s | pass   |
| 3   | rebuilt              | 27.3 / 19.2                 |   67.7 s | pass   |
| 4   | reference `dist`     | 19.2 / 22.8                 |   64.3 s | pass   |

The test time is dominated by `npm run build` of 16 generated projects; the
generated files are byte-identical, and the spread between runs of the same
tree is larger than any difference between the trees.
