# ADR-0312: Environment-dependent plugin defaults

- Status: proposed
- Date: 2026-10-09
- Refines: ADR-0292 (generalized from the PostgreSQL schema policy to every plugin), ADR-0208
  (environment truth), ADR-0295 (Hono listener address), ADR-0241 (GraphQL explorers); applies
  ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/revue-plugins/graphql-yoga.md`,
  decisions 1 to 3; transversal rule of `docs/handoff/revue-plugins/README.md`; `hono.md`,
  decision 1; `graphql-explorers.md`, concept and decision 3; `access.md`, decision 3;
  `postgres.md`, already settled; `docs/handoff/api-ideale-decisions.md`, decision 1;
  `testing.md`, decision 1; `create-app.md`, decision 3); awaiting validation of this record

## Context

ADR-0292 made one plugin read `NODE_ENV` (`packages/postgres-plugin/src/plugin/postgres-plugin.ts`).
Other defaults ask the developer to restate the environment: the explorers require
`environment: 'development' | 'production'` (`packages/graphiql-plugin/src/options.ts`),
`create-app` writes `introspection: process.env.NODE_ENV !== 'production'`
(`packages/create-app/src/api-template.ts`), Yoga disables introspection by default and Hono
leaves the listen address to Node. `postgresPlugin({ url })` needs the URL when the plugin list
is declared, which forces a second plugin list in examples and blocks type checks without `.env`.

## Decision

1. **Rule.** A plugin whose default depends on the deployment reads `process.env.NODE_ENV` in its
   factory, never in Core and never per request. `production` means production; any other value,
   or none, means development. An explicit option always wins. Official plugins share one helper
   from `@ultimabase/plugin-kit` so the rule has one implementation; Core does not import it.
2. **Current consumers.**
   - PostgreSQL `schemaPolicy`: `fail` in production, `override` otherwise (ADR-0292, unchanged).
   - Hono listen address: `host`, else `HOST`, else `127.0.0.1` in development and every
     interface in production; the port keeps `port`, then `PORT`, then 1337.
   - Yoga `introspection`: enabled in development, disabled in production.
   - GraphQL explorers: `environment` becomes optional and derived; the route is served in
     development and, in production, only with `allowInProduction: true`. An explorer that is
     served while introspection is off refuses to start (Yoga decision 2).
   - Access `allowWithoutRule` value `'development'`: allowed in development; in production the
     application refuses to start with a message naming the opened operations.
3. **`DATABASE_URL`.** `postgresPlugin()` without `url` or `pool` reads `DATABASE_URL` when the
   application starts, not in the factory, so schemas and applications import and type-check
   without environment and `testApplication` can supply an isolated database. An explicit `url`
   or `pool` always wins. A missing or empty variable fails `start()` with a message naming
   `DATABASE_URL` and the `url` option, never the value.
4. Each plugin logs the derived value and its source at debug level (ADR-0313); a development-only
   opening active in development is a visible warning.

## Consequences

- Consumers to migrate: the Hono options, Yoga options, explorer options (merged by the explorer
  review), Access options (with its own record for `allowWithoutRule`), PostgreSQL options
  normalization (zero sources allowed), `create-app` templates (no environment expressions, no
  `.env` for type checks, one plugin list) and examples.
- Tests per consumer: development default, production default, explicit option overriding each,
  `NODE_ENV` unset and unknown values treated as development, value read at factory time;
  `DATABASE_URL` read at start, explicit `url` precedence, missing variable error.
- Documentation impact: both (deployment guide, each plugin page and README, `create-app`).

## Out of scope

Other environment variables, a configuration file or CLI, per-request environment changes, and
GraphQL `cursorSecret` (removed by ADR-0309; if that record is rejected it joins this rule).
