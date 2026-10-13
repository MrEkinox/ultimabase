# ADR-0331: Testing workers resolve dual packages like Vite

- Status: accepted
- Date: 2026-10-13
- Refines: ADR-0327 (`ultimabaseTesting()`); applies ADR-0288
- Approval: chosen by the user on 2026-10-13 among the Node flag, a Vite plugin form of
  `ultimabaseTesting`, and deferring the GraphQL documentation

## Context

Under Vitest, files resolved by Vite drop the `module` condition and ignore `module-sync`, so a
package shipping both ESM and CommonJS builds resolves to its CommonJS build. External
dependencies loaded natively by Node.js resolve with `module-sync` and get the ESM build. A dual
package such as `graphql` then has two instances in one worker: a schema built by test or
inlined workspace code fails `instanceof` checks in `graphql-yoga` or `@graphql-tools/utils`
("Cannot use GraphQLSchema from another module or realm"). Applications that build their own
`GraphQLSchema` hit it too.

## Decision

`ultimabaseTesting()` also returns `execArgv: ['--no-experimental-require-module']`, so the
workers' Node.js resolution uses the same conditions as Vite and a dual package loads once. No
package is named, and the documented usage `test: { ...ultimabaseTesting() }` is unchanged.

## Consequences

- In tests, dual packages load their CommonJS build while production loads the ESM one.
- A dependency that relies on `require()` of an ESM-only package fails under these tests.
- Tests: a nested Vitest run on a neutral dual-package fixture proves one instance with the flag
  and two without; the GraphQL example runs its tests through `t.fetch`.
- Documentation impact: both (testing README, testing guide).
- The DX audit shows the new `execArgv` member of `UltimaBaseTestingConfig` and its hover.

## Reopening condition

A user is blocked by the `require()` limitation, or Node.js removes the flag: then move
`module-sync` into Vite's `ssr.resolve.conditions`, which needs `ultimabaseTesting` to configure
Vite beyond the `test` block (for example as a Vite plugin) in a new record.
