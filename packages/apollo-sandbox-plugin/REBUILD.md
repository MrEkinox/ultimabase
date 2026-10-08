# `@ultimabase/apollo-sandbox-plugin` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch `rebuild/small-plugins-b`, base `cd7dca7`) following
`docs/rebuild/PROTOCOL.md`. The public contract is unchanged: `apolloSandboxPlugin`, the
`ApolloSandboxPlugin`, `ApolloSandboxEnvironment` and `ApolloSandboxPluginOptions` types and their JSDoc; the
plugin id, version, Core range, `@ultimabase/http-plugin` peer, the
`transport:expose` privilege text, the `environment:network` claim, the
`official-apollo-sandbox-browser-route` contribution, the `ultimabase.apollo-sandbox` 1.0.0 protocol,
the `^1.0.0` materialization requirement on `graphqlHttpEndpointCapability`, the
production-disabled empty definition, and every option validation message.

The page module is **unchanged**: the HTML document, the nonce placement, the
`Content-Security-Policy` directives, `Permissions-Policy`, `Referrer-Policy`,
`X-Content-Type-Options`, `X-Frame-Options` and `Content-Type` headers, and the
`serializeInline` escaping (`<`, `>`, `&`, U+2028, U+2029) are byte-identical to
the reference. The built `dist/index.d.ts` and `dist/index.js` are identical to
the reference build (the bundler already inlined the removed locals).

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | apollo-sandbox-plugin production lines |
| --------- | -------------------------------------- |
| Before    | 197                                    |
| After     | 192                                    |
| Reduction | 5 lines                                |

What remains is the explorer HTML template and its security headers (which
must stay byte-identical), the public option and plugin types with JSDoc, and
the options parser whose messages are contract. The package was already close
to minimal.

## Design summary

| Module      | Change                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin.ts` | The non-exported `endpointRequirement` relies on inference instead of restating `CapabilityRequirement<typeof graphqlHttpEndpointCapability, false, '^1.0.0', 'materialization'>` (a scratch `expectTypeOf(...).toEqualTypeOf<...>()` check proved the inferred type is identical). Both branches return `plugin(...)` directly instead of through a single-use local. |
| unchanged   | `index.ts`, `options.ts`, `page.ts`.                                                                                                                                                                                                                                                                                                                                   |

### Duplication with `graphiql-plugin`

`page.ts`, `options.ts` and `plugin.ts` of both explorer packages are
structurally identical (same `serializeInline`, same non-CSP headers, same
inline application-id bootstrap script, same options parser shape, same
enabled/disabled factory). They were left duplicated on purpose:

- The only common dependencies are `@ultimabase/shared`, `@ultimabase/core`,
  `@ultimabase/plugin-kit`, `@ultimabase/http-plugin` and
  `@ultimabase/graphql-http`. Sharing the helpers through any of them would add
  runtime exports to that package's public `src/index.ts` (or a new
  `package.json` export), which changes a public contract.
- A shared factory would also have to be generic over the literal plugin id,
  contribution id, protocol name and messages, which would cost more lines than
  the duplicated `plugin.ts` (about 75 lines) saves.
- The page templates differ in every line that matters (assets, CSP, script),
  so only `serializeInline` (7 lines) and five header lines are truly shared.

## `as` casts

None before, none after (`as const` assertions are unchanged).

## Removed checks

None.

## Behaviour differences

None.

## Test mapping

No test was edited. `src/page.test.ts` deep-imports `./page.js` and
`src/plugin.test.ts` deep-imports `./plugin.js`; both modules keep the same
exports. No `packages/apollo-sandbox-plugin/src` path is listed in `apps/website/content`.

## Reference bugs

None found.

## Notes

`package.json` lists `@ultimabase/shared` as a dependency that no source file
imports. It was left in place (removing it would touch `package.json` and
`yarn.lock` for no production-line gain).

## Validation

See the shared validation section in `packages/server-hono-plugin/REBUILD.md`;
the six packages of this branch were validated together on the same tree.
