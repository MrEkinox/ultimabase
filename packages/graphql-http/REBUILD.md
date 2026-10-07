# `@ultimabase/graphql-http` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch `rebuild/small-plugins-b`, base `cd7dca7`) following
`docs/rebuild/PROTOCOL.md`. The public contract is unchanged: the
`graphqlHttpEndpointCapability` token (id, version, cardinality, lifetime), the
`GraphqlHttpEndpoint` and `GraphqlHttpEndpointCapability` types and their JSDoc.
The built `dist/index.d.ts` is byte-for-byte identical to the reference build.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | graphql-http production lines |
| --------- | ----------------------------- |
| Before    | 76                            |
| After     | 72                            |
| Reduction | 4 lines (5.3%)                |

The package is almost entirely public contract (one capability token and one
interface) plus one path validator; it was already minimal.

## Design summary

| Module        | Change                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint.ts` | The single-use assertion function `assertNormalizedPath` was merged into `normalizeGraphqlHttpEndpoint`. `path` is read once into a local, validated, and that same local is snapshotted (the reference read `value.path` a second time for the snapshot). |
| unchanged     | `index.ts`.                                                                                                                                                                                                                                                |

Every check, its order, its error class (`TypeError`) and its message are
unchanged: plain object with exactly one own key; string starting with `/`
without `?`, `#` or a trailing `/`; no empty segment; every segment decodes and
is neither `.`, `..` nor contains `/` once decoded.

A comparison script loaded the reference build and the rebuilt build (with the
internal `normalizeGraphqlHttpEndpoint` re-exported in a scratch copy) and ran
19 inputs: the test inputs, `/`, `null`, an array, a non-string path, a wrong
key, a symbol key, an inherited `path`, and a getter. Results, frozenness, error
classes and messages are identical for the 18 data inputs; only the getter case
differs (see below).

## `as` casts

None before, none after.

## Removed checks

None.

## Behaviour differences

One, for accessor inputs only (recorded in `docs/rebuild/DIFFERENCES.md`): a
provider value whose `path` getter returns `/ok` on the first read and
`/</script>` on the second was snapshotted as `{ path: '/</script>' }` by the
reference (the validated value was discarded); the rebuild snapshots
`{ path: '/ok' }`. Provider values reach `compose` unchanged from the
providing plugin's resource (`packages/core/src/plugins/capability-host.ts`),
so this was reachable by a third-party GraphQL HTTP provider. Ordinary data
values behave identically.

## Test mapping

No test was edited. `src/index.test.ts` deep-imports `./endpoint.js`
(`normalizeGraphqlHttpEndpoint`), which keeps the same export and signature.
No `packages/graphql-http/src` path is listed in `apps/website/content`.

## Reference bugs

The validate-then-reread gap described above (fixed, documented).

## Pre-existing failures and validation

See the shared validation section in `packages/server-hono-plugin/REBUILD.md`;
the six packages of this branch were validated together on the same tree.
