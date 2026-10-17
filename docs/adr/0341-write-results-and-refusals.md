# ADR-0341: Write results and refusals a client can act on

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0306 (readable mutation results), ADR-0324 (operation exposure), ADR-0326 (User creation),
  the HTTP context-resolver records; applies ADR-0288
- Approval: DX review of 2026-10-16 (`docs/handoff/revue-dx.md` §2.2, §2.4, §3.1, §3.2, §3.4, §6.1), plan item 3; accepted by the user on 2026-10-17 with `{ id }` as the default write result

## Context

The DX review found four refusals that block a correct application or that a client cannot interpret. Each was
reproduced on `main` a85c032e.

- **An authorized write fails because of its result.**
  - Without `select`, `createOne`, `createMany`, `updateOne`, `upsertOne`, `upsertMany` and `deleteOne` select every
    field.
  - When the caller may write the row but not read it (an audit entry, a contact form, an editor's draft), ADR-0306
    refuses the call with `PERMISSION_DENIED` (REST 403) and rolls it back.
  - `select: { id: true }` succeeds, and `updateMany`/`deleteMany` already default to `{ id }`.
  - The failure protects nothing that `select: { id: true }` does not already give, and three of four reviewers hit it.
- **Authentication is exposed twice over REST.**
  - Every auth operation is served by the auth plugin under `/api/auth/<kebab-name>`, and again by REST under
    `/api/operations/<name>`.
  - The second surface uses another body (`{ "input": … }`), answers every declared error with 400 instead of 401,
    returns the internal `principal`, and ignores cookie mode.
  - Hiding it takes a spread of three operation maps, which fails at start when the identifier is `username`.
- **The User's generic create route is dead.**
  - With an email identifier, creating a User outside sign-up is always rejected, Master included (ADR-0326).
  - Yet `POST /api/classes/<User>`, the OpenAPI entry and the GraphQL `create<User>` mutation are still published.
- **Sign-up and login fail on a missing rule.**
  - They read the new user's profile as that user. Without a rule letting a user read their own row, the call is
    rolled back.
  - The error is `PERMISSION_DENIED` or `NOT_FOUND` in TypeScript, and 500 `AUTH_INTERNAL_ERROR` under `/api/auth`.
  - Every application writes the same "own row" rule by hand.
- **An expired session looks like a wrong Master key.**
  - A revoked, expired or forged session token, a malformed `Authorization` header and a wrong Master key all answer
    401 `HTTP_APPLICATION_REJECTED`.
  - The HTTP plugin discards the error a context resolver throws; resolvers cannot declare one. A client cannot tell
    that it should sign the user in again.

## Decision

1. **A write returns `{ id }` unless it selects more.**
   - Every single-row and collection write without `select` returns `{ id }` (an array of them for collections), and
     its type says so. To receive more, the call selects it.
   - An explicit selection beyond `id`, or any `include`, keeps ADR-0306: it requires the caller to read the result,
     otherwise the call fails and is rolled back.
   - REST `POST`, `PATCH` and `DELETE` without `?select` answer `{ "result": { "id": … } }`. GraphQL is unchanged,
     since it always selects explicitly.
   - Master and plugin mutations follow the same rule; Soft Delete keeps its pre-image check for selected results.
2. **An owner that chooses an operation's transports chooses all of them.**
   - Default transport bindings apply only to a public operation whose owner binds it to no protocol.
   - An owner that binds an operation to any protocol, such as the auth plugin with its own HTTP routes and its
     GraphQL fields, exposes it only where it bound it. Core stays generic: it reads bindings, never plugin names.
   - The `hide` spreads disappear from examples, templates and docs.
3. **A plugin can close a generic command of a schema.**
   - Through a generic Core declaration, a plugin marks a generic command of a schema it contributes to as unavailable,
     with a reason; the auth plugin closes `create` on the User schema when the identifier is `email`.
   - Transports do not publish a closed command (no REST route, OpenAPI entry or GraphQL mutation), and a call answers
     the declared reason. Master does not reopen it.
4. **Own-row access is one rule, and its absence is named.**
   - The Access plugin exports `isSelf`, a rule that matches the row of the current principal when the principal
     points to this schema and nothing otherwise.
   - When sign-up, login or `current` cannot read the user's own row, the auth plugin fails with a dedicated
     `AUTH_USER_NOT_READABLE` error (HTTP 500 under every route, a configuration error) whose message names the
     User schema and suggests `read: isSelf`. Examples and templates use `isSelf`.
5. **A session refusal is distinct from an application refusal.**
   - HTTP context resolvers may declare the errors they throw, with their HTTP status. The HTTP plugin answers a
     declared error as declared and still answers any other failure with `HTTP_APPLICATION_REJECTED`.
   - The auth resolver declares `AUTH_INVALID_SESSION` (401) for a revoked, expired, forged or stale token, keeping one
     uniform code for all of them. A wrong Master key or a malformed header stays `HTTP_APPLICATION_REJECTED`.
6. **One refusal table.** The Access page documents which rule form produces which result (`PERMISSION_DENIED` 403,
   `[]`/`null`, `NOT_FOUND` 404, `PublicError` 400). No behaviour changes for this item.

## Consequences

- **Security.**
  - Decision 1 reveals nothing new: `select: { id: true }` already returns the identifier of a row the caller just
    wrote.
  - It removes an implicit safety net: a `PATCH` or `DELETE` that `update` or `delete` allows on a row `read` hides now
    commits and answers `{ id }`, as the rules say. Applications that relied on the failure narrow their write rules.
  - Decision 5 tells a client only that its session is invalid, never why.
- **Types and examples.**
  - Write result types default to `{ id }`. Calls that read other fields of a write result add `select`, converted in
    the same work.
  - Examples, templates and docs drop the `hide` spreads and the hand-written own-row rules.
- **Tests.**
  - Writes without `select` on unreadable rows, through TypeScript, REST and plugin commands.
  - Explicit selections still refused.
  - Auth served once over REST, in email and username modes.
  - Closed User create absent from REST, OpenAPI and GraphQL, and refused for Master.
  - `isSelf` with and without a matching principal.
  - `AUTH_USER_NOT_READABLE` under every route.
  - Expired, revoked and forged sessions answering `AUTH_INVALID_SESSION`, and a wrong Master key answering
    `HTTP_APPLICATION_REJECTED`.
- **Measurements:** DX audit; form D bench, because write result types change.
- **Out of scope:** homogeneous validation issue paths, `PublicError` with `issues` and error guards (review §3.3)
  get their own record.
- **Documentation impact:** both.
