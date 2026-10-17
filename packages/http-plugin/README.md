# @ultimabase/http-plugin

The HTTP foundation of an application: application identity, request context
resolution, Fetch-compatible routes, browser policy, security headers and rate
limits. Servers, REST and GraphQL are separate plugins.

## Installation

```sh
npm install @ultimabase/http-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. A server provider such as
`@ultimabase/hono-server-plugin` listens on a socket; `@ultimabase/api-server`
installs both.

## Example

Its options, from the tested [`examples/http`](../../examples/http/README.md)
application:

<!-- region ../../examples/http/src/http.ts#http-options -->

```ts
/** Every option of the HTTP foundation is optional; these are this API's. */
export const http = {
	appId: 'links',
	browser,
	// One reverse proxy in front: it appends the client to `X-Forwarded-For`
	// and tells the protocol in `X-Forwarded-Proto`.
	trustProxy: 1,
	rateLimit,
	bodyLimit: 262_144, // 256 KiB for every route without its own limit.
	requestTimeoutMs: 10_000,
	securityHeaders,
	// Operators send the Master key header; MasterAuthority verifies it.
	master: true,
	routes,
	accessLog: true,
} satisfies HttpPluginOptions
```

<!-- endregion -->

## Documentation

- [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx)
- [Hono Server](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
- [Before Exposing Your Application](../../apps/website/content/docs/1.0.0/operations/before-exposing-your-application.mdx)
