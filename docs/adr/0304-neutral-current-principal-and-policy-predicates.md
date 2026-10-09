# ADR-0304: Neutral current principal and policy predicates

- Status: proposed
- Date: 2026-10-09
- Refines: ADR-0113 (plugin-owned authentication), ADR-0117 (subject capabilities, now
  `requestPrincipalResolverCapability` in `packages/core/src/access/subject/contracts.ts`);
  applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/access.md` decisions 3, 4 and 12; `hooks.md` decision 2;
  `acl.md` decision 6; `roles.md` decisions 2 and 4; `password-auth.md` decision 2);
  awaiting validation of this record

## Context

Core already defines a single-provider principal capability that Password Auth provides
(`packages/password-auth-plugin/src/plugin.ts`) and ACL consumes
(`packages/acl-permissions-plugin/src/application-state.ts`). The other consumers bypass it:
Access rules import `passwordPrincipal` from the authentication plugin, Hooks receive no
principal, and Roles calls its own `resolveCurrent` (`packages/roles-plugin/src/role-access.ts`),
so roles silently resolve nothing when it is missing. Roles also imports Access types
(`role-access.ts`, `role-schema.ts`) to offer `hasRole`, a package link between two plugins.

## Decision

1. **`Principal`.** The authenticated identity of the current request is a Core `Pointer`
   (`{ id, schema }`) to a row of the provider's identity schema, or `undefined` when anonymous.
   Through `Register` it is typed by name (`Pointer<"TodoUser">`). Core owns no user schema,
   session or credential, and authority remains `anonymous` or `master`.
2. **One provider.** The existing capability keeps its `single` cardinality: the authentication
   plugin provides it, a second provider fails at startup, and without a provider the principal
   is always `undefined`.
3. **Resolution by Core.** Core resolves the principal at most once per request context, before
   the first callback that receives it; it is immutable for the request and inherited by nested,
   hook-issued and transactional operations. `useMasterKey` changes authority, not identity: the
   principal stays. Server code outside a request has no principal.
4. **Consumers receive it as `principal`**, never by importing the provider: Access rule functions
   and `allowWithoutRule` predicates, the Hooks `context.principal`, ACL callbacks and
   `new ACL(principal)`, Roles (the current member is the principal when its schema is the role
   members schema; `resolveCurrent` remains for special cases), `ultimabase.can()` (ADR-0305) and
   GraphQL `execute({ principal })`.
5. **`PolicyPredicate`.** Core exports
   `type PolicyPredicate = (context: { principal, operation, schema }) => boolean | Promise<boolean>`.
   Predicates are named functions (the name appears in startup logs), side-effect free and
   replayable (ADR-0300). Access accepts one wherever a rule returns a decision without a filter,
   including `allowWithoutRule`; ACL and future policy plugins accept them likewise. Roles'
   `hasRole(Role)` returns one, and Core exports `isAuthenticated` (`principal !== undefined`),
   which reads only the Core principal. A predicate that throws fails closed: the operation is
   rejected and the error masked unless it is a `PublicError` (ADR-0305).

## Consequences

- Roles drops its dependency on `@ultimabase/access-plugin` (enforced by `yarn constraints`);
  Access, Hooks and Roles read the Core principal; `passwordPrincipal` remains only to read the
  session itself; `create-app` templates stop importing it in rules.
- Tests: no provider gives `undefined`; two providers fail at startup; the principal reaches each
  callback kind; Master keeps it; one resolution per request; Roles works without `resolveCurrent`;
  predicates in Access rules and `allowWithoutRule`; a throwing predicate fails closed; hovers
  print `Pointer<"TodoUser">` from source and built packages.
- Documentation impact: both (authentication, Access, Hooks, ACL and Roles pages; READMEs).

## Out of scope

Several identity schemas or tenants per application, server-side impersonation beyond explicit
`principal` arguments, role permissions (`hasPermission`), the Access combinators (kept in Access).
