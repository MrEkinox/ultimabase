# 613: Expose explicit plugin operations through GraphQL

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/core`, `@ultimabase/graphql-plugin`, `@ultimabase/password-auth-plugin`
- Depends on: 612
- ADR: ADR-0193, ADR-0209, ADR-0225, ADR-0233, ADR-0238 and ADR-0240

## Goal

Bind explicitly selected application operations to GraphQL without making an
operation declaration public automatically or creating another execution path.

## Acceptance criteria

- [x] GraphQL defines one canonical protocol name and version through Core's
      public operation-transport identity.
- [x] An operation is reachable only when its owner holds active
      `transport:expose`, contributes an exact compatible GraphQL binding and
      codecs, and application configuration selects that operation.
- [x] Input, result, and every declared public plugin error follow the accepted
      GraphQL type and error mapping and are validated before startup.
- [x] Root field names and types cannot collide with generated schema fields,
      custom schema contributions, introspection names, or another operation.
- [x] Execution preserves the selected request context, exact callback owner,
      operation transaction policy, Runtime middleware, cancellation, and
      application lifecycle through Core's operation transport facade.
- [x] Variables, arguments, extensions, custom context values, and structural
      lookalikes cannot select Master, a foreign application, an unexposed
      operation, a privilege, an adapter, or a persistence plan.
- [x] Password Auth contributes GraphQL bindings for the accepted `signUp`,
      `login`, `logout`, and refresh operations without importing the GraphQL
      package, and GraphQL imports or identifies no authentication product.
- [x] Authentication establishes request identity only; later schema operations
      continue to rely on independently installed Runtime policy providers.

## Tests

- [x] Private, exposed, missing-binding, denied-privilege,
      incompatible-version, collision, malformed-input, safe-error,
      cancellation, and cross-application operation fixtures pass.
- [x] Password Auth sign-up, login, refresh, logout, invalid credentials,
      session reuse, and secret-redaction tests run networklessly through the
      public GraphQL schema.

## Out of scope

- Automatically exposing installed operations or adding authentication logic
  to GraphQL.
