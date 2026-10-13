# HTTP example

A small links API that shows the HTTP layer end to end: the HTTP foundation's
options (application identity, browser origins, body limits, a proxy in
front, rate limits shared through a store with `/health` exempt, security
headers, the Master header and the access log), application routes and a
`PublicError` answer, a credential plugin resolving a partner from a Bearer
token, a plugin contributing a route and a mount, the `apiServer` preset with
REST and the managed Hono listener (compression, graceful shutdown), the
error envelope, and a second application joining an existing Hono app. It
uses the declaration form (ADR-0297) without generated files and is tested
with `testApplication` (ADR-0327); REST only serves as routes to call.

The [HTTP page](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx),
the [Hono Server page](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
and the [`http-plugin`](../../packages/http-plugin/README.md),
[`hono-server-plugin`](../../packages/hono-server-plugin/README.md) and
[`api-server`](../../packages/api-server/README.md) READMEs show this
application's code: each block is a `//#region <name>` of these files,
included by the pages and copied into the READMEs by `yarn docs:regions`
(ADR-0330). Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                       | What it shows                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`src/http.ts`](src/http.ts)                               | the `httpPlugin` options: browser origins, rate limit, security headers, and all of them together                         |
| [`src/routes.ts`](src/routes.ts)                           | application routes: a status route reading the request context, a contact form with its own body and rate limits          |
| [`src/counters.ts`](src/counters.ts)                       | the shared rate limit store over a stand-in for a Redis client                                                            |
| [`src/partners.ts`](src/partners.ts)                       | a credential plugin: a request context resolver for partner Bearer tokens, with a browser policy check                    |
| [`src/api-info-plugin.ts`](src/api-info-plugin.ts)         | a `definePlugin` plugin contributing a route with `httpRoutes` and a mount with `provideHttpEndpoints`                    |
| [`src/schema.ts`](src/schema.ts)                           | the factory with `apiServer` (HTTP, REST, the managed Hono server) and the `Link` schema                                  |
| [`src/ultimabase.ts`](src/ultimabase.ts)                   | the application, its `MasterAuthority` and its `Register` declaration                                                     |
| [`src/main.ts`](src/main.ts)                               | the entry point: start, listening address, awaited shutdown on SIGINT or SIGTERM                                          |
| [`src/existing-app.ts`](src/existing-app.ts)               | a second application installing the plugins one by one on an existing Hono app                                            |
| [`src/existing-main.ts`](src/existing-main.ts)             | its entry point: a listener you own, closed after UltimaBase stops                                                        |
| [`src/env.ts`](src/env.ts)                                 | secrets read from the environment                                                                                         |
| [`tests/routes.test.ts`](tests/routes.test.ts)             | requests without a server, application and plugin routes, the `PublicError` envelope, body limits, request IDs            |
| [`tests/identity.test.ts`](tests/identity.test.ts)         | the optional application header, the partner resolver, the Master header                                                  |
| [`tests/browser.test.ts`](tests/browser.test.ts)           | the effective browser policy, preflights, CORS as a browser policy rather than access control                             |
| [`tests/limits.test.ts`](tests/limits.test.ts)             | rate limits per client address, route limits, a failing store, security headers, the access log                           |
| [`tests/network.test.ts`](tests/network.test.ts)           | the managed listener over a real socket: proxy trust, duplicated headers, compression, in-flight requests during shutdown |
| [`tests/existing-app.test.ts`](tests/existing-app.test.ts) | the existing Hono app: its own routes, UltimaBase's, a refused preflight, missing raw headers, and routes after a stop    |

Test secrets are fixed fake values set in [`vitest.config.ts`](vitest.config.ts).
Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-http typecheck
corepack yarn workspace @ultimabase/example-http test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_http \
	ULTIMABASE_MASTER_KEY=CHANGE_ME_MASTER_KEY ACME_PARTNER_TOKEN=CHANGE_ME_PARTNER_TOKEN \
	corepack yarn workspace @ultimabase/example-http start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves `http://127.0.0.1:1337/health`,
`/status`, `/version` and REST on `/api/classes/Link` until Ctrl+C;
`start:existing` serves the second application on
`http://127.0.0.1:3000/ping` and `/health`. Replace the placeholder secrets
with private random values. The PostgreSQL `override` schema policy (the
default outside production) is convenient for this development example and is
not a production migration strategy.
