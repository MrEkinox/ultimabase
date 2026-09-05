# Minimal REST application

This runnable example is the smallest complete public UltimaBase REST vertical.
It starts a framework-owned Hono listener on port `1337`, stores data in
PostgreSQL, requires `X-UltimaBase-Application-Id: minimal-rest`, and exposes
only the configured `ExampleAuthor` and `ExampleArticle` schema routes plus the
explicit `example.status` plugin operation.

The application installs Access, ACL, Hooks, and Validation independently.
Anonymous requests receive only published, public-ACL articles. A valid Master
header is verified by this exact application and audited before it bypasses
authorization; validation, hooks, transactions, and database integrity still
run.

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

`createMinimalRestClient()` shows how a Fetch client injects the public
application ID and, for trusted integration tests only, a Master key. Never put
the Master key in a browser bundle or treat the application ID as a secret.

## Current boundary

This example exercises the working REST v1 APIs: CRUD, query routes, stable JSON
responses, public errors, browser CORS, application selection, and audited
Master execution. Password Auth, GraphQL, a generated SDK, OpenAPI, uploads, and
production deployment are later roadmap work and are intentionally absent.

The committed `.ultimabase/schema.generated.d.ts` gives the source exact editor
types. Regenerate and verify it with:

```sh
corepack yarn workspace @ultimabase/example-minimal-rest generate-types
corepack yarn workspace @ultimabase/example-minimal-rest check-generated-types
corepack yarn workspace @ultimabase/example-minimal-rest typecheck
```

The application still executes the compiled declaration graph directly;
generated declarations are replaceable tooling and never become Runtime truth.
