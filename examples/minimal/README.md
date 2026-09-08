# Minimal REST and GraphQL application

This runnable example is the smallest complete authenticated UltimaBase
multi-transport vertical. It starts a framework-owned Hono listener on port
`1337`, stores data in PostgreSQL, and mounts REST and Yoga GraphQL as sibling
transports over one HTTP application.

Every public request requires
`X-UltimaBase-Application-Id: minimal`. REST is mounted under `/api/v1` and
GraphQL accepts `POST /graphql`. The application exposes only
`ExampleAuthor`, `ExampleArticle`, and `ExamplePrivateNote` CRUD plus the
explicit `example.status` and four Password Auth operations. `ExampleRole` has
no generated GraphQL roots, and Password Auth credentials and session storage
never enter either public schema.

Access, ACL, Hooks, Validation, Roles, Password Auth, REST, GraphQL, Yoga,
HTTP, Hono, and PostgreSQL remain explicit independently removable plugins.
REST and GraphQL normalize requests into the same Core operation pipeline;
their offset envelopes and Relay connections remain intentionally different
wire representations.

## Run it

From the repository root, build the packages and supply a development database
plus a server-only Master key:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_minimal \
ULTIMABASE_MASTER_KEY=development-only-secret \
  corepack yarn workspace @ultimabase/example-minimal start
```

The server listens at `http://127.0.0.1:1337`.

## REST and GraphQL use the same Runtime

Create an article through REST:

```sh
curl http://127.0.0.1:1337/api/v1/classes/ExampleArticle \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"slug":"hello-rest","title":"  Hello REST  "}'
```

Create another through Yoga GraphQL:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"query":"mutation Create($input: ExampleArticleCreateInput!) { createExampleArticle(input: $input) { id slug title } }","variables":{"input":{"slug":"hello-graphql","title":"  Hello GraphQL  "}}}'
```

Both titles are trimmed by the same Hook, validated by the same Validation
plugin, authorized by the same Access and ACL policies, and persisted in the
same automatic mutation transaction.

Trusted server code can execute the identical GraphQL application without
Yoga or HTTP:

```ts
const graphql = ultimabase.application.getPlugin('@ultimabase/graphql-plugin')
const context = ultimabase.engine.anonymous({
	requestId: crypto.randomUUID(),
	source: 'internal',
}).context

await graphql.execute({
	context,
	document: `{
		findManyExampleArticle(first: 10) {
			nodes { id slug title }
			pageInfo { hasNextPage endCursor }
		}
	}`,
})
```

## Session flow

Sign up through the explicit GraphQL operation binding:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"query":"mutation SignUp($input: PasswordAuthCredentialsInput!) { signUp(input: $input) { principal { userId } session { token expiresAt } } }","variables":{"input":{"username":"ada","password":"correct horse battery staple"}}}'
```

The response contains a one-time opaque `ub_s1.*` token. Send it with the
standard Bearer scheme to REST or GraphQL; authentication adds a request
principal while Core authority remains `anonymous`:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --header 'Authorization: Bearer ub_s1.REPLACE_WITH_THE_SESSION_TOKEN' \
  --data '{"query":"{ status { authority principalId } }"}'
```

`login`, `refresh`, and `logout` are mutations on the same `/graphql` endpoint.
They are available only because their exact operation tokens were selected by
`graphqlPlugin({ operations })`; installing Password Auth alone publishes
nothing.

Browser cookie mode is also enabled for `http://localhost:5173`. Cookie-changing
routes require the configured origin as CSRF proof and never return the raw
token in JSON:

```sh
curl http://127.0.0.1:1337/auth/v1/login \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:5173' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --cookie-jar /tmp/ultimabase-minimal-cookies.txt \
  --data '{"username":"ada","password":"correct horse battery staple"}'

curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:5173' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --cookie /tmp/ultimabase-minimal-cookies.txt \
  --data '{"query":"{ status { authority principalId } }"}'
```

## Audited Master flow

A Master key is trusted server-side authority, not a user session. The HTTP
plugin accepts it only because this example explicitly enables the Master
transport. The selected application verifies and audits it before GraphQL runs:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --header 'X-UltimaBase-Request-Id: trusted-maintenance-1' \
  --header 'X-UltimaBase-Master-Key: development-only-secret' \
  --data '{"query":"{ status { authority principalId } }"}'
```

The response reports authority `master`; the default audit callback records the
key ID and request ID without logging the raw key. Never place a Master key in a
browser bundle. Master bypasses authorization policies but not validation,
hooks, transactions, constraints, or integrity maintenance.

`createMinimalClient()` demonstrates the shared Fetch header handling. Its
`masterKey` option exists for trusted integration code only.

## Generated declarations and current boundary

The committed `.ultimabase/schema.generated.d.ts` provides exact editor types
for both REST and GraphQL schema options. Regenerate and verify it with:

```sh
corepack yarn workspace @ultimabase/example-minimal generate-types
corepack yarn workspace @ultimabase/example-minimal check-generated-types
corepack yarn workspace @ultimabase/example-minimal typecheck
```

The application executes the compiled declaration graph directly; generated
declarations are replaceable tooling and never Runtime truth. Subscriptions,
live queries, federation, uploads, persisted queries, `@defer`, `@stream`,
OpenAPI, generated clients, realtime, and administration remain intentionally
outside this example.
