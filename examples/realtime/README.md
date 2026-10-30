# Realtime

Tasks that clients follow live (`realtime()`, `realtimePlugin()`): a list
sends its rows once, then only what changed.

- `src/models.ts`: the `Task` model and the live function `tasksLeft`.
- `src/app.ts`: the application.
- `src/feed.ts`: a plugin that sends the tasks over its own WebSocket,
  closed with its viewer.
- `src/maintenance.ts`: a maintenance switch that refuses new WebSockets
  with 503 and closes those open with 1012.
- `src/app.test.ts`: a live list over GraphQL and over Server-Sent Events,
  a live row, page mode, the live function and the limits.
- `src/react.test.ts`: a React component following the list through Apollo.
- `src/feed.test.ts`: the plugin's socket.
- `src/maintenance.test.ts`: the sockets during maintenance.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/realtime` runs its tests.
