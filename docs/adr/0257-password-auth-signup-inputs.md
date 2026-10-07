# ADR-0257: Schema-derived Password Auth signup inputs

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0235, ADR-0254, ADR-0256

## Context

The user approved accepting User create fields during signup while keeping
login limited to username and password. Requiring identical inputs makes a
User with a required application field impossible to register.

## Decision

Signup accepts a flat object containing username, password, and the declared
User create fields. Required fields without defaults must be supplied; optional,
defaulted, and generated fields may be omitted. AppUser.signUp infers these
rules directly from its field declaration. Relationship fields use ordinary
nested-create commands. Login retains its exact credentials-only contract.
PasswordUserReference carries nominal User ownership independently of the
schema-specific command parameter types; plugin configuration and result
constraints accept that reference without widening a concrete signup method.

The operation snapshots application data before asynchronous hashing, removes
password before creating User, and delegates to the existing create pipeline.
Defaults, validation, hooks, normalization, audited Master elevation, and the
User/credential/session transaction retain their existing semantics. Binary
inputs use a private immutable snapshot with a detached native copy restored
only for creation; Core's immutable operation boundary is unchanged.

REST operation metadata gains optional inputSchema, identifying a schema owned
by the exact operation owner. REST reuses ordinary nested-create codecs before
invoking the binding decoder. GraphQL supporting input objects gain optional
createFieldsFrom with the same ownership rule. They reuse ordinary create
input fields and codecs; explicit fields cannot override inherited names.
Neither declaration exposes generated CRUD routes or executes defaults.

Password Auth declares inputSchema User and PasswordAuthSignUpInput derived
from User plus password String!. PasswordAuthCredentialsInput remains the login
input. Existing signup GraphQL clients must update the variable type name.
REST paths, envelopes, results, and explicit operation allowlists stay intact.

## Verification

Cover required, optional, and defaulted fields in direct TypeScript and both
transports; reject missing, invalid, and unknown fields atomically. Keep login
strict. Check byte snapshots, native transport codecs, exact ownership,
autocomplete against source and built exports, and absent public User CRUD.
