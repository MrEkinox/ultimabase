# Plugins

Four plugins written for an application, each one a kind a plugin can be:

- `src/plugins/publishing.ts`: a model plugin. It adds `publishedAt`, an
  index, hooks that hide drafts, the `drafts` and `publish` commands, and the
  caller's `editor` key, read from a model of its own.
- `src/plugins/color.ts`: a field type, `color()`, stored as `#rrggbb` and
  read as `{ red, green, blue }`.
- `src/plugins/api-keys.ts`: an identity. A request with `x-api-key` runs as
  the key's owner; the plugin gives the `createApiKey` function and keeps its
  keys in a cache that its changes clear. It uses rpc when it is installed.
- `src/plugins/rpc.ts`: a transport on the HTTP plugin, `POST /rpc/<name>`
  for each function, which offers other plugins a function's address.

The application lists them in `src/app.ts`; `src/models.ts` and
`src/functions.ts` use them. `src/app.test.ts` calls them as a client does,
and `src/start.test.ts` what they do at start, refusals included.

`yarn start` serves it on http://localhost:3000; `yarn vitest examples/plugins`
runs its tests.
