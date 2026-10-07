# 616: Add GraphiQL and Apollo Sandbox plugins

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/graphiql-plugin`, `@ultimabase/apollo-sandbox-plugin`
- Depends on: 615
- ADR: ADR-0010, ADR-0238 and ADR-0241

## Goal

Provide separate optional GraphiQL and Apollo Sandbox plugins without coupling
developer tooling to the production GraphQL transport.

## Acceptance criteria

- [x] Each publishable package and package directory ends in `-plugin`, exports
      one focused plugin factory, and composes through the provider-neutral
      GraphQL HTTP capability rather than importing Core internals or Yoga.
- [x] Explorer endpoints are absent unless their plugin is explicitly
      configured and are disabled in production unless the developer explicitly
      opts in through the accepted production override.
- [x] Explorer routes retain exact owner provenance, participate in HTTP route
      collision and browser-policy validation, and clean up with their owning
      application.
- [x] No explorer embeds an application ID, Master key, session credential, raw
      configuration secret, schema-private metadata, or reusable authority.
- [x] Each explorer targets only the selected application's GraphQL endpoint and
      cannot enumerate or switch to another application mounted on the server.
- [x] Remote assets, content security, cache behavior, and environmental claims
      match the issue 608 contract and are truthful in startup diagnostics.
- [x] There is no generic provider-switch explorer plugin or production
      dependency from GraphQL Core or Yoga to either UI package.

## Tests

- [x] Development, production, explicit override, collision, browser policy,
      multi-application, secret-redaction, asset, lifecycle, and packed-package
      fixtures pass.

## Out of scope

- An administration console, schema registry, generated client, authentication
  UI, or a generic web asset framework.
