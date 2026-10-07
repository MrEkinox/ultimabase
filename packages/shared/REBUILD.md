# `@ultimabase/shared` rebuild notes

Reviewed against reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch `rebuild/small-plugins-b`, base `cd7dca7`) following
`docs/rebuild/PROTOCOL.md`. **No source change.**

## Production lines (`node tooling/measure-rebuild.mjs .`)

|        | shared production lines |
| ------ | ----------------------- |
| Before | 74                      |
| After  | 74                      |

## Why unchanged

Every production line is public contract consumed by almost every package:
`Brand`, `MaybePromise`, `assertNever`, `immutableArray`, `immutableRecord`,
`isPlainRecord`, `isUnknownArray`, `assertNonEmptyString` and
`assertOptionalBoolean`, each with its JSDoc, exact generic signature
(`const` type parameters, `asserts` predicates checked by
`src/index.test-d.ts`) and error messages. Each function is already a single
expression or a single guard; there is no indirection, duplication or wrapper
to remove. `runtime-value.ts` is kept as a separate module because
`src/runtime-value.test.ts` deep-imports it.

The explorer packages (`graphiql-plugin`, `apollo-sandbox-plugin`) share a
duplicated `serializeInline` helper and the same non-CSP security headers.
`@ultimabase/shared` is their common dependency, but moving those helpers here
would add runtime exports to this package's public entry, which the protocol
forbids, so they stay duplicated (see their `REBUILD.md`).

## Test mapping, casts, checks, differences

No test edited; no `as` cast before or after; no check removed; no behaviour
difference. The built `dist/index.d.ts` and `dist/index.js` are identical to the
reference build. No `packages/shared/src` path is listed in
`apps/website/content`.

## Validation

See the shared validation section in `packages/server-hono-plugin/REBUILD.md`.
Because every package consumes `@ultimabase/shared`, the consumer run there
covers the unit and types suites of every package.
