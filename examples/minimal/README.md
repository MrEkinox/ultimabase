# Minimal REST application

This runnable example is the smallest complete authenticated UltimaBase REST
vertical.
It starts a framework-owned Hono listener on port `1337`, stores data in
PostgreSQL, requires `X-UltimaBase-Application-Id: minimal-rest`, and exposes
only the configured `ExampleAuthor`, `ExampleArticle`, and
`ExamplePrivateNote` schema routes plus the explicit `example.status` and four
Password Auth operations.

The application installs Password Auth, Roles, Access, ACL, Hooks, and
Validation independently. Anonymous requests receive only published,
public-ACL articles. Authenticated members of the `editor` role can manage
private notes through both Access and ACL. A valid Master header is verified by
this exact application and audited before it bypasses authorization;
validation, hooks, transactions, and database integrity still run.

## Run it

From the repository root, build the packages and supply a development database
and a server-only Master key:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_minimal \
ULTIMABASE_MASTER_KEY=development-only-secret \
  corepack yarn workspace @ultimabase/example-minimal-rest start
```

The server listens at `http://127.0.0.1:1337`. Create an article anonymously:

```sh
curl http://127.0.0.1:1337/api/v1/classes/ExampleArticle \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal-rest' \
  --data '{"slug":"hello","title":"Hello"}'
```

Call the explicitly exposed operation:

```sh
curl http://127.0.0.1:1337/api/v1/operations/example.status \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal-rest' \
  --data '{"input":null}'
```

Sign up through the generic REST operation bridge:

```sh
curl http://127.0.0.1:1337/api/v1/operations/ultimabase.password-auth.sign-up \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal-rest' \
  --data '{"input":{"username":"ada","password":"correct horse battery staple"}}'
```

The response contains a one-time opaque `ub_s1.*` session token. Send it as a
Bearer credential; the application ID still selects the application and grants
nothing by itself:

```sh
curl http://127.0.0.1:1337/api/v1/operations/example.status \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal-rest' \
  --header 'Authorization: Bearer ub_s1.REPLACE_WITH_THE_SESSION_TOKEN' \
  --data '{"input":null}'
```

`example.status` returns Core authority separately from the safe authenticated
principal ID. Authentication therefore keeps authority `anonymous`; a valid
server-side Master header may coexist and changes only authority to `master`.
Trusted server code creates the `editor` role and adds a `PasswordUser` pointer
with ordinary immutable Role model commands before that user can access
`ExamplePrivateNote`.

Browser cookie mode is also enabled for the exact configured origin. Its
`/auth/v1/*` routes require credentialed CORS, matching `Origin`, and JSON.
Cookies are host-only, `Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`; their
JSON responses never expose the raw token. Bearer and the transport-neutral
operations remain available unchanged.

`createMinimalRestClient()` shows how a Fetch client injects the public
application ID plus an optional opaque `sessionToken`. Its `masterKey` option is
for trusted integration tests only. Never put the Master key in a browser
bundle or treat the application ID as a secret.

## Current boundary

This example exercises REST v1 CRUD, query routes, explicit authentication
operations, Bearer and cookie sessions, stable public errors, browser CORS,
application selection, policy composition, and audited Master execution.
GraphQL, a generated SDK, OpenAPI, uploads, and production deployment remain
intentionally absent.

The committed `.ultimabase/schema.generated.d.ts` gives the source exact editor
types. Regenerate and verify it with:

```sh
corepack yarn workspace @ultimabase/example-minimal-rest generate-types
corepack yarn workspace @ultimabase/example-minimal-rest check-generated-types
corepack yarn workspace @ultimabase/example-minimal-rest typecheck
```

The application still executes the compiled declaration graph directly;
generated declarations are replaceable tooling and never become Runtime truth.
