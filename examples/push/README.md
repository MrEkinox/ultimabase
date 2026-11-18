# Push

Web push notifications (`pushPlugin()`): a signed-in browser subscribes, and
the server notifies each device of a user. Each device belongs to a session,
so a sign-out stops its notifications.

- `src/functions.ts`: the application's functions, which give the browser
  its key, save its subscription, and send a test.
- `src/app.ts`: the application, with the keys from its environment.
- `src/app.test.ts`: sign-up, subscription and pushes, kept in memory.
- `src/sw.ts`: the service worker, which shows each push; the front end
  builds it and serves it at `/sw.js`.
- `src/notifications.ts`: the front end's subscription.

`npx @ultimabase/push keys` prints the keys for the environment, and
`yarn start` serves the application on http://localhost:3000; without the
keys it starts and warns. `yarn vitest examples/push` runs its tests.
