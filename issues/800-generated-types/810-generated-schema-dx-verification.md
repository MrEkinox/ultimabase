# 810: Verify generated schema authoring DX and performance

- Status: completed
- Milestone: 8
- Packages: all milestone packages
- Depends on: 811, 1509
- ADR: ADR-0173, ADR-0187, ADR-0189, ADR-0192, ADR-0193, ADR-0194

## Goal

Audit the complete generated-schema authoring vertical for correctness,
editor quality, resource use, startup behavior, package consumption, and
application isolation before declaring the migration complete.

## Acceptance criteria

- [x] A representative large-schema fixture records TypeScript process memory, typecheck duration, completion latency, and hover output before and after generated contracts.
- [x] The result demonstrates whether generated named types materially reduce recursive inference cost; documentation reports measurements rather than promising a fixed memory reduction.
- [x] Stable TypeScript source and packed-package consumers complete built-in and plugin field methods, schema fields, select, where, include, mutations, and installed official or alternative Hooks and Access surfaces exactly.
- [x] Generated-contract tests prove that each schema's exact item type replaces `BaseItem`, while a no-Typegen fixture exposes only the documented bootstrap identity and unknown application fields.
- [x] First generation through the public Typegen API, stale output, plugin installation/removal, clean checkout, and read-only consumption of committed declarations are verified end to end.
- [x] Two applications and parallel workers retain isolated plugin method registries and schema graphs.
- [x] Generated output is deterministic across operating-system paths and repeated clean runs.
- [x] No Core dependency on a concrete plugin, infrastructure library, transport, database, or TypeScript compiler plugin was introduced.
- [x] Large application fixtures measure the final open-kernel schema, handle, operation, official-plugin, and alternative-plugin contracts delivered through issue 1509 rather than the superseded native surface.
- [x] Remaining intentional limitations and later optimization candidates are documented without speculative APIs.
- [x] Automatic writable-development generation is documented as current DX;
      manual generation, check/watch commands, build integration, and read-only
      packaged startup verification remain deferred to issue 808.

## Tests

- [x] Repository typecheck, tests, lint, formatting, constraints, build, packed archives, and complete PostgreSQL E2E pass.
- [x] The final handoff includes one realistic public API example and the recorded editor-performance evidence.

## Editor-performance evidence

The guarded fixture in
`tests/performance/typegen-editor.performance.test.ts` compares the same
48-schema, 576-scalar-field application in separate Node.js processes. The
recursive scenario models the former field-map-driven expansion across items,
filters, selections, inclusions, mutations, Access, Hooks, schema handles,
plugin operations, and alternative policy or behavior contracts. The generated
scenario names those same contracts as the current Typegen output does. Both
include the installed-only Validation field option shape.

Five alternating samples per scenario were recorded on 2026-09-02 with Node.js
24.18.0, TypeScript 6.0.3, and Darwin 25.3.0 arm64. Values below are medians:

| Observation               |   Recursive |   Generated | Observed change |
| ------------------------- | ----------: | ----------: | --------------: |
| Semantic typecheck        |  314.361 ms |  247.914 ms |          -21.1% |
| First completion          |    8.602 ms |    8.194 ms |           -4.7% |
| First hover               |    5.892 ms |    3.045 ms |          -48.3% |
| V8 heap after explicit GC |  72.618 MiB |  73.364 MiB |           +1.0% |
| Resident process memory   | 325.141 MiB | 277.391 MiB |          -14.7% |

Both scenarios completed `field0` through `field11` plus `id` with zero
diagnostics. The generated hover was the compact
`const item0: Schema0Item`; the recursive hover expanded the complete
`SchemaDefinition` field map. On this fixture, named contracts materially
improve semantic-check and hover work and reduce resident memory, while first
completion changes only slightly and V8 heap use is effectively unchanged.
These observations are not a fixed performance guarantee.

## Contract evidence

- `packages/typegen/src/official-options-language-service.test.ts` verifies one
  generated application with Access, Hooks, and Validation installed, then
  verifies that removing them changes the fingerprint and removes only their
  option contracts.
- `packages/typegen/src/generator-language-service.test.ts` covers exact source
  FieldBuilder methods, schema items, select, where, include, mutations,
  pointers, relations, official Access and Hooks, and plugin fields.
- `tests/e2e/typegen-generated-types.e2e.test.ts` repeats the public contract
  against packed packages, including Validation compatibility and the committed
  Todo declaration.
- `tests/e2e/package-archives.e2e.test.ts` proves the no-Typegen bootstrap item
  exposes only `id` plus unknown application fields rather than an inferred
  application model.
- `packages/typegen/src/plugin.test.ts`, `writer.test.ts`, and `loader.test.ts`
  cover first generation without an existing artifact, stale atomic
  replacement, read-only prior artifacts, source loading without setup, and
  identical output from separate clean absolute source paths.
- Typegen's field, option, contribution, and surface isolation suites cover two
  application graphs. Vitest fork workers exercise those fixtures without a
  process-global FieldBuilder or schema registry.
- The Core dependency graph and repository constraints keep Typegen optional and
  prevent Core from importing Typegen, an official plugin, infrastructure, or
  the TypeScript compiler.

## Realistic public flow

The committed Todo example exercises the final generated contract:

```ts
const pending = await Todo.findMany(
	{
		include: { assignee: { select: { displayName: true } } },
		select: { completed: true, priority: true, title: true },
		where: { completed: { eq: false } },
	},
	{ ultimabase },
)

pending[0]?.title // string
pending[0]?.assignee?.displayName // string
```

The schema declaration remains Runtime truth. The committed generated file
provides exact application types and can be consumed read-only without running
Typegen during typecheck.

## Intentional limitations

`typegenPlugin()` already performs automatic full regeneration during writable
development startup. Issue 808 remains deferred for manual generate/check/watch
commands, generation-before-typecheck build integration, and read-only packaged
startup fingerprint verification. Generation remains full and deterministic;
there is no incremental cache, TypeScript plugin, generated Runtime client, or
machine-independent performance SLA.

## Verification

- `yarn constraints`
- `yarn check:issues` — 1 file and 9 tests passed
- `yarn typecheck`
- `yarn test` — 352 files and 1,706 tests passed with no type errors
- `yarn lint` — zero errors; only the existing reviewed line-budget warnings
- `yarn format:check`
- `yarn build` — every public workspace passed declarations, ATTW, and publint
- `yarn test:pack:built` — 19 files and 98 tests passed
- `yarn test:e2e:built` — 51 files and 201 ordinary plus PostgreSQL tests passed

The isolated E2E attempt could not discover Docker. The required rerun outside
filesystem isolation reached the local container runtime and passed completely,
so no environment limitation remains.
