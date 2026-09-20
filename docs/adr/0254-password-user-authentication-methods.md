# ADR-0254: Authentication methods on Password User classes

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0235, ADR-0253
- Uses: the schema specialization boundary and ADR-0248's application-selection convention

## Context

The user approved `AppUser.signUp()`, `login()`, `refresh()`, and `logout()`
instead of requiring application operation handles and session callbacks for
ordinary authentication. The existing operations and their security semantics
remain canonical. These are application operations, not target-aware schema
mutations such as Soft Delete; ADR-0248's schema-mutation dispatcher cannot
execute them directly.

## Decision

`PasswordUserSchema.define()` uses the existing `Schema.defineWithStatics()`
composition point to attach four immutable dispatchers before the exact class is
frozen. `PasswordUser` receives the same methods. No exported class or prototype
is patched after construction, and model instances gain no authentication methods.

Sign-up and login accept the existing `{ username, password }` input. Refresh
and logout accept an explicit raw session token and internally use the existing
`runWithSession()` boundary. Each method takes optional
`PasswordUserAuthOptions`, containing only `ultimabase`.

Outside a request, the caller must pass `{ ultimabase }`. Inside a request, the
owning facade is selected automatically. A conflicting explicit application,
an unstarted or stopped application, or a different User class fails before
credential work. There is no default application or mutable current-user state.

Core adds `getCurrentUltimaBase()` beside its existing contextual helpers so a
trusted server-side specialization can resolve the canonical application
operation handles. A private weak association maps the active application to
its facade. Missing scopes and low-level frameworks without a facade fail with
`MISSING_EXECUTION_CONTEXT`. This introduces no concrete plugin dependency and
does not change transport capability boundaries. Soft Delete continues to use
the schema-mutation dispatcher and does not need this accessor.

The exact operation tokens, handlers, session validation, transaction policy,
Master audit, and required authorized profile reads are reused. Refresh and
logout open the same isolated session scope as `runWithSession()` and restore
the caller's scope afterward. Authentication results retain `{ user, session,
principal }`; class methods specialize the result to their exact User contract.
Custom profile fields follow the ordinary generated schema contract.

## Scope and retained APIs

This adds four server-side convenience methods. Operation tokens and direct
operation handles remain supported for explicit transport selection and advanced
execution; `runWithSession()` remains supported for authenticated application
work. No superseded implementation or export exists to remove. No new routes,
session representation, credential rules, privileges, automatic refresh, model
methods, or generic static operation registry are introduced.

## Verification

Cover explicit and ambient execution, concurrent applications sharing a User
class, foreign classes and tokens, lifecycle failures, immutable schema identity,
session rotation and revocation, required-profile rollback, exact result types,
and source and compiled editor completions with real generated custom fields.
