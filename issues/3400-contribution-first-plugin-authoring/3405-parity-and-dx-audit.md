# 3405: Audit behavior, documentation, and DX

- Status: completed
- Milestone: 34
- Depends on: 3404
- ADR: ADR-0270

## Goal

Prove repository-wide parity and report whether the contribution-first API
materially reduces plugin-authoring ceremony.

## Acceptance criteria

- [x] Compiled graphs, privilege reports, capability inventories, lifecycle
      order, Typegen, transports, Runtime, and cleanup retain parity.
- [x] Public and package documentation shows only the canonical API.
- [x] Full validation and coverage pass without regression.
- [x] Added/deleted lines, representative before/after forms, remaining
      complexity, and recommended follow-up work are recorded.

## Migration accounting

The comparison base is `91a8bcaf`, immediately before milestone 34. The final
cumulative diff touches 276 files, adds 10,050 lines, deletes 8,049, and
therefore adds 2,001 net lines. This is migration
churn rather than author-facing ceremony:

| Area                                      | Files | Added | Deleted |  Net |
| ----------------------------------------- | ----: | ----: | ------: | ---: |
| Production and tooling                    |    32 | 2,032 |   1,488 | +544 |
| Tests and fixtures                        |   217 | 7,140 |   6,151 | +989 |
| Public/package documentation and examples |    18 |   430 |     410 |  +20 |
| Issues and ADR                            |     9 |   448 |       0 | +448 |

The Core implementation pays most of the production increase: the canonical
factory, contribution compiler, nominal contribution factories, and permission
normalizer add 1,145 lines while deleting 286 legacy Core lines, for +859 net.
That additional Core code removes decisions and duplication from every plugin
author. Across the 17 migrated official plugin implementation files, the
authoring code moves in the opposite direction: 792 lines added, 1,111 deleted,
for 319 fewer production lines. Representative complete plugin files shrink as
follows:

| Plugin        | Before | After | Net |
| ------------- | -----: | ----: | --: |
| Password Auth |    326 |   306 | -20 |
| Soft Delete   |    243 |   213 | -30 |
| Access        |    303 |   288 | -15 |
| HTTP          |    197 |   177 | -20 |
| REST          |    490 |   457 | -33 |
| PostgreSQL    |    359 |   341 | -18 |

## Representative authoring form

Before, one plugin spread the same intent across public compiler phases and
repeated metadata already implied by its work:

```ts
definePlugin({
	pluginId: 'community.workflow',
	privileges: [{ name: 'schema:declare', reason: 'Adds workflow state.' }],
	capabilities: [stateProvider, stateRequirement],
	declare: ({ schemas }) => registerWorkflowSchema(schemas),
	operations: [workflowOperation],
	setup: ({ capabilities }) => ({ state: capabilities.get(stateRequirement) }),
	hooks: { startRuntime: ({ pluginExports }) => pluginExports.state.start() },
})
```

After, identity, reviewable reasons, and ordered behavior have one visible home.
Core derives phase placement, required privilege names, capability buckets,
operation declarations, and lifecycle teardown from the contributions:

```ts
plugin({
	id: 'community.workflow',
	permissions: { 'schema:declare': 'Adds workflow state.' },
	contributions: [
		stateProvider,
		stateRequirement,
		contributeDeclarations({
			schema: ({ schemas }) => registerWorkflowSchema(schemas),
		}),
		workflowOperation,
		contributeApplication(({ capabilities }) => {
			const state = capabilities.get(stateRequirement)
			return {
				exports: { state },
				startRuntime: () => state.start(),
				dispose: () => state.dispose(),
			}
		}),
	],
})
```

There is now one construction factory, one flat contribution list, no nested
plugin modules, no public lifecycle/phase buckets, and no compatibility alias.
Permission names are derived while human reasons stay explicit. Exceptional
callback privileges are attached to the exact contribution that consumes them
with `withPluginPrivileges()`.

## Parity evidence

- Existing graph, capability, privilege, lifecycle, cleanup, schema, model,
  private-storage, operation, transport, Runtime, Typegen, and application
  export suites all run against the canonical form.
- JavaScript fixtures execute from built package exports without Typegen, so
  the proof does not depend on workspace-only TypeScript inference.
- Package archive tests prove the removed factories are absent and the
  canonical exports remain consumable after packing.
- The repository contains no current use of `definePlugin`,
  `definePluginModule`, or `DefinePluginOptions` outside historical ADRs and
  issues.
- Full coverage passes at 90.50% statements, 83.93% branches, 95.80%
  functions, and 91.10% lines.

## DX assessment

The goal is materially achieved. An author no longer chooses between Core and
Plugin Kit construction paths, nested and flat plugins, capability/operation
side lists, or setup and lifecycle locations. Adding a feature means adding
one contribution to one ordered list. The official implementations are shorter
even though they retain every existing capability.

The result is not “zero complexity.” Advanced plugins still express the real
boundaries they use: versioned capabilities, pure declarations,
application-local resources, transport codecs, and explicit permission
reasons. Keeping those boundaries visible is necessary for composition,
security review, deterministic teardown, and JavaScript operation without
Typegen. Hiding them behind an untyped bag would make the API shorter but less
safe.

## Recommended follow-up work

1. Simplify `defineCapability<T>()({...})` to one inference-friendly call where
   TypeScript can preserve the same exact token and composition types. It is
   now the most visible remaining double-factory ceremony.
2. Improve the displayed type of a returned `PluginInstance` so hover shows
   identity, exports, and capabilities without exposing a long positional
   generic. This changes editor presentation, not Runtime behavior.
3. Add focused operation/transport authoring helpers in the owning transport
   packages only where two real plugins repeat the same codec and binding
   sequence. Do not add another generic Core registration path.
4. Tighten JavaScript author feedback with checked JSDoc examples and a small
   package-level authoring smoke-test recipe. Runtime validation already fails
   early, but `.mjs` cannot receive the same registrar separation diagnostics
   as TypeScript.

## Handoff

- Documentation impact: both. The canonical public website, package READMEs,
  Core engineering documentation, ADR-0270, milestone issues, examples, and
  templates all describe and exercise the same contribution-first API.
- Validation: `yarn typecheck`; `yarn test` (540 files, 2,557 tests);
  `yarn test:e2e:built` (98 files, 387 tests); `yarn test:pack:built` (32 files,
  163 tests); `yarn test:coverage` (615 files, 2,804 tests); `yarn lint` with no
  errors; `yarn build` with clean `attw` and `publint`; `yarn website:validate`
  (17 files, 66 tests); changed-file Prettier; exhaustive removed-API search;
  and `git diff --check`.
- Repository-wide `yarn format:check` reports two unchanged pre-existing files:
  `apps/website/content/docs/1.0.0/reference/package-index.mdx` and
  `apps/website/tests/plugins.content.test.ts`. Every file changed by this
  milestone passes Prettier.
