# @ultimabase/hono-server-plugin

The official HTTP server provider: it serves the HTTP plugin's routes with Hono
on Node.js, manages the listener and its graceful shutdown, or mounts them in
your own Hono app.

## Installation

```sh
npm install @ultimabase/http-plugin @ultimabase/hono-server-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency, and `@ultimabase/http-plugin` is
required beside it. Install `hono` and `@hono/node-server` too when you import
them yourself.

## Example

Start the application and its listener, from the tested
[`examples/http`](../../examples/http/README.md) application:

<!-- region ../../examples/http/src/main.ts#main -->

```ts
import { ultimabase } from './ultimabase.ts'

await using started = await ultimabase.start()
const address = started.plugin('@ultimabase/hono-server-plugin').address()
console.info(`Listening on port ${String(address?.port)}`)
// SIGINT or SIGTERM stops the application: it refuses new requests, lets
// in-flight ones finish and closes the listener. Leaving this scope then
// closes the database.
await started.closed
```

<!-- endregion -->

## Documentation

- [Hono Server](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
- [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx)
