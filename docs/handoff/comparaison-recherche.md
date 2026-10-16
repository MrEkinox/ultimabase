# Recherche pour la section « Comparaison » (2026-10-17)

Données brutes (en anglais) pour écrire les pages de comparaison après l’ADR-0340 : matrice sourcée, correspondances de vocabulaire, liste des manques. Les cellules marquées « unverified » ou « nf » doivent être revérifiées avant toute publication.

# UltimaBase comparison: research for the documentation "Comparison" section

Retrieval date for every external source: **2026-10-17**. Official sources only:
documentation sites, official GitHub repositories and READMEs, and official
pricing or licence pages. The research came from four input files in this
folder (`ub-notes.md`, `parse-prisma.md`, `supabase-firebase.md` and
`pocketbase-appwrite.md`) plus spot checks made while writing this file. Each
input file carries the claims it marks as unverified, and so does this file.

UltimaBase column: `ub-notes.md`, checked against `/Users/mrekinox/Desktop/ub-small`
(main `6f37748e`). UltimaBase page paths are relative to
`apps/website/content/docs/1.0.0/`.

Versions relied on (2026-10-17):

| System          | Version                                                                                                                                               | Source        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Parse Server    | 9.10.5 (2026-10-16); LTS lines 8.6.x and 7.5.x patched                                                                                                | [P14]         |
| Parse Dashboard | 9.2.0                                                                                                                                                 | [P12]         |
| Parse JS SDK    | 8.6.2                                                                                                                                                 | [P13]         |
| Supabase        | hosted platform (unversioned); `supabase/supabase` repo; supabase-js 2.118.0; PostgREST 16.4                                                          | [S43]         |
| Firebase        | hosted platform (unversioned); JS SDK 13.0.0; firebase-tools 15.34.0                                                                                  | [F50] [F51]   |
| PocketBase      | v0.40.5 (2026-10-08)                                                                                                                                  | [PB1] [PB24]  |
| Appwrite        | 2.5.0 (2026-10-13)                                                                                                                                    | [A25]         |
| Prisma ORM      | 7.x is stable (7.10.1). Prisma ORM 8 is a release candidate, but npm `prisma@latest` already resolves to 8.0.0-rc.23. GA is expected in October 2026. | [PR15] [PR17] |

Cell vocabulary: **yes**, **partial**, **no**, **n/a**, **planned** (UltimaBase
only). "no (not documented)" means the official docs never mention the feature.
It does not mean the docs deny it. **unverified** means no official page
confirmed the claim. "(nf)" marks an official URL that was not fetched; it is
known from the documentation structure.

---

## 1. Capability matrix

Rows 1–35 keep the list and wording from `ub-notes.md`. Rows 36–38 are added
because at least three of the five backends have the capability and the
original list did not cover it. Prisma is an ORM, so it is compared only on
rows 1–5, 29 and 32–34. Every other Prisma cell is "n/a (not a backend)",
sometimes followed by a useful pointer.

| #   | Capability                                    | UltimaBase                                                                                                                                                                                                                                 | Parse Server                                                                                                                                                                                              | Supabase                                                                                                                                                                                 | Firebase                                                                                                                                                                                   | PocketBase                                                                                                                                     | Appwrite                                                                                                                                                                                          | Prisma ORM (7, 8 RC noted)                                                                                                                                                                                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema definition                             | **yes**: TypeScript `App.Schema.define({ className, fields, indexes, features }).with({ …rules })`; types are inferred, with no codegen                                                                                                    | **yes**: classes are schemaless and created on first save, and a field's type locks after its first write. Optional "Defined Schema" (fields, indexes, CLPs) lives in the server config [P3] [P7]         | **yes**: Postgres tables built with SQL or the Studio Table Editor; declarative schema files in `supabase/schemas` [S1] [S2]                                                             | **partial**: Firestore "is schemaless". SQL Connect (formerly Data Connect) declares a GraphQL schema (`@table`) on Cloud SQL Postgres [F1] [F2]                                           | **yes**: collections (base, auth or view) with typed fields, defined in the Dashboard or in JS/Go [PB2]                                        | **yes**: TablesDB tables with typed columns since 1.8; DocumentsDB (schemaless) and VectorsDB since 2.0 [A1] [A2]                                                                                 | **yes**: `schema.prisma` (PSL, multi-file). Prisma 8 replaces it with `contract.prisma` and `prisma contract emit` [PR1] [PR18]                                                                                                 |
| 2   | Migrations                                    | **partial / planned**: PostgreSQL `schemaPolicy` (`override`, `fail` or `ignore`) synchronizes at startup, plus `renamedFrom`. There is no migration runner yet; a migration plugin is planned                                             | **partial**: Defined Schema synchronizes at startup (`strict`, `deleteExtraFields`, `recreateModifiedFields`, `lockSchemas`, `beforeMigration`/`afterMigration`). No versioned migration files [P7] [P11] | **yes**: versioned SQL migrations through the CLI (`migration new`/`up`, `db diff`, `db reset`, `db push`); declarative schemas, with the pg-delta engine still experimental [S2]        | **partial**: none for Firestore. SQL Connect generates and applies SQL migrations (`dataconnect:sql:diff` and `sql:migrate`) [F3]                                                          | **yes**: JS or Go migration files; automigrate writes a file for each Dashboard change; `migrate up/down/collections/history-sync` [PB3] [PB4] | **partial**: schema as code through `appwrite pull/push tables` (`appwrite.config.json`), but no versioned migrations. The product named "Migrations" imports data from other platforms [A4] [A5] | **yes**: `migrate dev` (shadow DB, drift detection), `migrate deploy` and `db push`; Migrate does not support MongoDB. Prisma 8 uses `prisma migration plan` and `prisma db migrate` [PR2] [PR18]                               |
| 3   | Query API                                     | **yes**: `findMany`/`findOne`/`findOneOrThrow`/`count`/`exists`. Operators include comparisons, string, list, JSON and AND/OR/NOT; pagination by cursor (`after` + `take`) or `skip`. No aggregates beyond `count` and no full-text search | **yes**: `Parse.Query` constraints, `or`/`and`, `count`, `distinct`, `fullText`, and an `aggregate` pipeline that requires the master key [P3]                                                            | **yes**: the supabase-js PostgREST builder (`from().select().eq()…`). Anything beyond it goes to SQL functions through `.rpc()` [S3] [S28]                                               | **yes, with limits**: `where`, `in` (≤30), `not-in` (≤10), `array-contains`; inequalities on at most 10 fields; `count`/`sum`/`average`. `or()` syntax and limits are unverified [F4] [F5] | **yes**: a filter expression language, `sort`, `expand`, `fields`, `page`/`perPage`, `skipTotal`; no aggregation documented [PB5] [PB6]        | **yes**: `Query.equal`/`between`/`startsWith`/`contains`/`search`, `and`/`or`, cursors, `select`, spatial operators. Aggregation is unverified [A6]                                               | **yes**: `findMany`/`findUnique`/`findFirst`, `where`/`orderBy`/`select`/`include`/`omit`, cursor pagination, `aggregate`/`groupBy`. The Prisma 8 query API "has a new shape" (`db.orm…`) [PR3] [PR4] [PR5] [PR18]              |
| 4   | Relations                                     | **yes**: `pointer` (to-one; `onDelete` restrict, cascade or setNull) and `relation` (to-many, owning or `mappedBy`); `include` with nested where/orderBy/take; `some`/`none`/`every`/`count` predicates; nested writes                     | **yes**: Pointer and Relation, `include`, relational queries. On Postgres, "Join tables are resolved in memory" [P3] [P2]                                                                                 | **yes**: embedding detected from foreign keys in `select`, many-to-many through a join table, `!inner` [S4]                                                                              | **partial**: Firestore Standard has references and no joins. Enterprise Pipelines join through subqueries. SQL Connect has real foreign keys [F6] [F7] [F2]                                | **yes**: single or multiple relation fields, `expand` up to 6 levels, back-relations, `cascadeDelete` [PB7]                                    | **yes**: 1:1 through N:N, one-way or two-way, `onDelete` restrict/cascade/setNull, depth ≤3, loading is opt-in [A7]                                                                               | **yes**: 1-1, 1-n and m-n; nested reads and writes; `some`/`every`/`none`. Prisma 8 postpones most nested writes [PR6] [PR7] [PR18]                                                                                             |
| 5   | Transactions                                  | **yes**: every root mutation runs in an automatic transaction; `ultimabase.transaction(fn)` propagates through the async scope; bulk writes are all-or-nothing                                                                             | **partial**: the REST `/batch` endpoint accepts `transaction: true` with retries. This exists only in source code; the guides do not document it [P8]                                                     | **partial**: supabase-js cannot group queries into a transaction. Atomic multi-statement logic goes in a Postgres function called with `.rpc()` [S3]                                     | **yes**: `runTransaction` (reads before writes, automatic retry, fails offline) and `writeBatch`; SQL Connect `@transaction` [F8]                                                          | **yes**: server-side `$app.runInTransaction`. `POST /api/batch` runs as a single transaction once enabled in Settings [PB9] [PB5]              | **yes**: `createTransaction`/`updateTransaction` (commit or rollback) since 1.8. Operation caps depend on the Cloud plan (100 Free, 1,000 Pro, 2,500 Scale) [A8]                                  | **yes (v7)**: nested writes, `$transaction([...])`, and interactive `$transaction(async tx => …, { isolationLevel, maxWait, timeout })`. Prisma 8 offers `db.transaction(...)` with no isolation or timeout option [PR8] [PR29] |
| 6   | Realtime                                      | **planned**: ROADMAP "Realtime". The GraphQL plugin rejects subscriptions and SSE                                                                                                                                                          | **yes**: LiveQuery over WebSocket (create, update, delete, enter and leave events), ACLs enforced, Redis for multiple instances [P2]                                                                      | **yes**: Broadcast, Presence and Postgres Changes, authorized by RLS. Concurrent connections and messages are capped per plan [S5] [S6] [S16]                                            | **yes**: Firestore `onSnapshot` with latency compensation; SQL Connect subscriptions [F9] [F10]                                                                                            | **yes**: SSE subscriptions that apply the list and view rules [PB10]                                                                           | **yes**: WebSocket channels filtered by permissions, and by query since 1.9 [A9] [A10]                                                                                                            | n/a (not a backend). Pulse (a paid cloud product) is deprecated [PR24]; the official shutdown notice is unverified                                                                                                              |
| 7   | Files / storage                               | **planned**: ROADMAP "File fields". `f.binary()` only stores bytes                                                                                                                                                                         | **yes**: `Parse.File`; adapters GridFS (the default on MongoDB), S3, GCS and FS; optional encryption; file triggers [P2] [P4]                                                                             | **yes**: buckets with RLS on `storage.objects`, TUS resumable uploads, an S3-compatible API and a CDN. Image transformations are paid (Pro and above) [S7] [S8] [S16]                    | **yes**: Cloud Storage for Firebase with Storage Rules. Requires the Blaze plan since 2026-02-03, default buckets included [F11] [F12]                                                     | **yes**: file fields, local disk or S3, thumbnails, protected files [PB11]                                                                     | **yes**: buckets with encryption, compression, image transformations and file tokens [A11]                                                                                                        | n/a (not a backend)                                                                                                                                                                                                             |
| 8   | Password auth                                 | **yes**: `auth-plugin` + `auth-password`: Argon2id, email or username identifier, reset, verification, email change, attempt limiting                                                                                                      | **yes**: `Parse.User` `signUp`/`logIn`, password and account-lockout policies, email verification and reset (both need an email adapter) [P3] [P1]                                                        | **yes**: `signUp`, `signInWithPassword`, `resetPasswordForEmail` [S9]                                                                                                                    | **yes**: email/password with a password policy; email enumeration protection on by default [F13]                                                                                           | **yes**: `authWithPassword`; the identity can be any unique field [PB12]                                                                       | **yes**: email/password (Argon2) [A12]                                                                                                                                                            | n/a (not a backend)                                                                                                                                                                                                             |
| 9   | OAuth / social                                | **planned**: ROADMAP "More authentication" (Google, GitHub, generic OIDC, PKCE), plus a Better Auth plugin                                                                                                                                 | **yes**: auth adapters (apple, facebook, github, google, microsoft, keycloak, ldap, generic oauth2, twitter…), each enabled explicitly [P2] [P10]                                                         | **yes**: 19 built-in providers plus custom OAuth/OIDC, third-party JWTs, SAML SSO (Pro and above) and an OAuth server mode [S10] [S11] [S16]                                             | **yes**: Google, Apple, Facebook, Twitter, GitHub, Microsoft, Yahoo, Play Games and Game Center. SAML and OIDC need the Identity Platform upgrade [F14]                                    | **yes**: OAuth2 per auth collection (Google, GitHub, Microsoft, Apple…); not available for superusers [PB12]                                   | **yes**: 30+ providers [A12]                                                                                                                                                                      | n/a (not a backend)                                                                                                                                                                                                             |
| 10  | Magic link                                    | **no**: not in the roadmap                                                                                                                                                                                                                 | **no (not documented)**: a custom auth adapter is possible [P10]                                                                                                                                          | **yes**: magic link or email OTP (`signInWithOtp`/`verifyOtp`); passkeys are experimental [S12] [S14]                                                                                    | **yes**: email-link sign-in (`sendSignInLinkToEmail`); phone SMS [F15] [F14]                                                                                                               | **partial**: email OTP; no magic link documented [PB12]                                                                                        | **yes**: magic URL, email OTP, phone SMS; passkeys [A12]                                                                                                                                          | n/a (not a backend)                                                                                                                                                                                                             |
| 11  | MFA                                           | **planned**: two-factor and passkeys come after OAuth (ROADMAP)                                                                                                                                                                            | **yes (documented only in source)**: the built-in `mfa` adapter supports TOTP, SMS and recovery codes and is described only in source comments [P9]                                                       | **yes**: TOTP and phone. Phone MFA is a paid add-on ($75/month for the first project) [S15] [S16]                                                                                        | **partial**: SMS and TOTP work only after upgrading to "Firebase Authentication with Identity Platform" [F16] [F17] [F18]                                                                  | **yes**: any two auth methods (since v0.23) [PB12]                                                                                             | **yes**: TOTP, email and phone factors, recovery codes [A13]                                                                                                                                      | n/a (not a backend)                                                                                                                                                                                                             |
| 12  | Sessions                                      | **yes**: opaque tokens stored as SHA-256, Bearer header and cookie, expiry and absolute expiry, refresh, list and revoke, `logoutEverywhere`, recent-authentication checks                                                                 | **yes**: `_Session` objects and `sessionToken`; a sessions REST API to query and delete sessions [P3] [P5]                                                                                                | **yes**: a 1 h JWT access token plus a single-use refresh token; `auth.sessions`. Time-box, inactivity and single-session limits need Pro or above [S17]                                 | **yes**: 1 h ID tokens plus refresh tokens; `revokeRefreshTokens` and `verifyIdToken(…, checkRevoked)` [F19]                                                                               | **partial**: stateless HS256 JWTs, no logout endpoint and no per-session revocation [PB12]                                                     | **yes**: server-side sessions (cookie), session limits, JWTs, SSR support [A14] [A15]                                                                                                             | n/a (not a backend)                                                                                                                                                                                                             |
| 13  | Row-level authorization                       | **yes**: an Access read rule returns a row filter compiled into the DB query; deny by default                                                                                                                                              | **yes**: per-object ACLs plus pointer permissions (a "virtual ACL" from a user pointer field). `beforeFind` triggers can rewrite queries [P2] [P4]                                                        | **yes**: Postgres RLS (`auth.uid()`, `auth.jwt()`). RLS is not enabled by default, and service or secret keys bypass it [S18]                                                            | **yes**: Security Rules per document. "Rules are not filters": a query fails if it could return a forbidden document. The Admin SDK bypasses rules [F20] [F22]                             | **yes**: list/view/create/update/delete rules act as filters; `null` (the default) means superusers only [PB6]                                 | **yes**: table permissions plus row permissions ("row security"), deny by default [A16]                                                                                                           | n/a (not a backend). A non-production RLS example extension exists [PR19]                                                                                                                                                       |
| 14  | Class / field-level permissions               | **yes**: Access operation rules per schema, plus field read and write rules                                                                                                                                                                | **yes**: CLPs per operation (including `requiresAuthentication` and pointer permissions); `protectedFields` per user or role [P2] [P11]                                                                   | **yes**: table grants and column privileges (described as "not recommended for most users"). From 2026-10-30, new public tables are not exposed without an explicit GRANT [S19] [S20]    | **partial**: collection-level rules through `match`. Field-level checks are possible for writes (`affectedKeys()`) but not for reads [F23]                                                 | **partial**: collection-level rules; per-field `hidden` flag only [PB6] [PB13]                                                                 | **partial**: table-level permissions; column-level permissions not documented [A17]                                                                                                               | n/a (not a backend). `omit` hides fields but does not authorize [PR20]                                                                                                                                                          |
| 15  | ACL (per-object)                              | **yes**: `acl-permissions-plugin` (`acl: true`); per-row read/update/delete for public, authenticated, principal or role subjects, enforced in the DB                                                                                      | **yes**: `Parse.ACL` read/write per user, role and public [P2]                                                                                                                                            | **no**: build it yourself with RLS and your own tables [S18]                                                                                                                             | **partial (DIY)**: a roles map stored on each document and checked in rules [F24]                                                                                                          | **no (not documented)**: emulated with relation fields in rules [PB6]                                                                          | **yes**: `$permissions` on each row or file; resources created by a client default to the creator [A17]                                                                                           | n/a (not a backend)                                                                                                                                                                                                             |
| 16  | Roles                                         | **yes**: `roles-plugin` (`RoleSchema`, members, `includedRoles` hierarchy, `hasRole()`)                                                                                                                                                    | **yes**: `Parse.Role` (`_Role`) with child-role hierarchy [P3] [P5]                                                                                                                                       | **partial**: Postgres roles. Application RBAC is a documented recipe (a `user_roles` table, a Custom Access Token hook and an `authorize()` function in RLS) [S21]                       | **partial**: custom claims (`setCustomUserClaims`, 1000 bytes) carried in the ID token and checked in rules; no role objects or hierarchy [F25]                                            | **no**: only superusers; roles are modeled as your own fields or collections [PB12]                                                            | **yes**: teams with custom roles, labels, and `Role.*` permission helpers [A17] [A18] [A19]                                                                                                       | n/a (not a backend)                                                                                                                                                                                                             |
| 17  | Server-side logic                             | **yes**: `hooks-plugin` (`resolveInput`, `beforeOperation`, `afterOperation`, `afterCommit`, field and global hooks, typed events); custom operations (`defineOperation`) exposed over REST and GraphQL; HTTP routes. No read hooks        | **yes**: Cloud Code functions; `beforeSave`/`afterSave`, `beforeDelete`/`afterDelete`, `beforeFind`/`afterFind`, auth, LiveQuery and file triggers; jobs; custom routes [P4] [P1]                         | **yes**: Edge Functions (Deno), Postgres functions and triggers, Database Webhooks (asynchronous, through pg_net), Auth hooks [S22] [S23] [S24] [S25]                                    | **yes**: Cloud Functions triggers (run after the write), callable and HTTP functions. Blocking auth functions need Identity Platform, and deploying needs Blaze [F26] [F27] [F28] [F29]    | **yes**: Go or JS hooks (model, request, realtime, mailer) and custom routes [PB14] [PB15]                                                     | **partial**: Functions (containers) triggered by HTTP, SDK, events or schedule. Events are asynchronous; no synchronous before-write hook is documented [A20] [A3]                                | n/a (not a backend). The `query` component of client extensions wraps operations (row 33)                                                                                                                                       |
| 18  | Validation                                    | **yes**: structural checks in Core; `validation-plugin` with Standard Schema (Zod/Valibot/ArkType) or a function, async and schema-level checks                                                                                            | **yes**: `beforeSave`; Cloud Function validators (`fields` with types, `requireUser`, `rateLimit`); `required` in Defined Schema [P4] [P7]                                                                | **yes (database-level)**: Postgres types, constraints and triggers; `pg_jsonschema`. No application-level schema DSL [S26]                                                               | **partial**: only in Security Rules, which server SDKs bypass; SQL Connect `@check` [F21]                                                                                                  | **yes**: field options (required, min, max, pattern); `onRecordValidate` hook [PB8] [PB14]                                                     | **partial**: typed columns, required, size, enum and format checks; custom validation only through Functions. Numeric min/max unverified [A2]                                                     | n/a (not a backend)                                                                                                                                                                                                             |
| 19  | Soft delete                                   | **yes**: `soft-delete-plugin` (tombstones, restore, purge, `readDeleted` permission)                                                                                                                                                       | **no (not documented)**                                                                                                                                                                                   | **no**: documented do-it-yourself pattern (`deleted_at` column plus a view) [S27]                                                                                                        | **no**: do it yourself; TTL policies delete expired documents [F30]                                                                                                                        | **no (not documented)** [PB2]                                                                                                                  | **no (not documented)** [A21]                                                                                                                                                                     | n/a (not a backend). A do-it-yourself query extension is possible [PR27]                                                                                                                                                        |
| 20  | REST                                          | **yes (experimental)**: `rest-plugin` at `/api/classes/{Class}`, JSON `where`, cursors, bulk writes, operations                                                                                                                            | **yes**: objects, users, sessions, roles, files, push, functions, schemas and hooks; `routeAllowList` [P5] [P1]                                                                                           | **yes**: PostgREST at `/rest/v1` [S28]                                                                                                                                                   | **yes**: Firestore REST API. Calls carrying an ID token are checked by rules; service-account calls bypass them [F31]                                                                      | **yes**: a "REST-ish" API [PB5]                                                                                                                | **yes**: `/v1` [A22]                                                                                                                                                                              | n/a (not a backend)                                                                                                                                                                                                             |
| 21  | GraphQL                                       | **yes**: `graphql-plugin` with Yoga, Relay connections and limits; no subscriptions                                                                                                                                                        | **yes**: auto-generated Relay-style API plus custom `schema.graphql` resolvers backed by Cloud Code; no subscriptions documented [P6] [P1]                                                                | **partial**: pg_graphql at `/graphql/v1`. Since early 2026 it is not enabled automatically on new projects, and introspection is off by default [S29] [S30]                              | **partial**: only through SQL Connect (GraphQL connectors with `@auth`); none for Firestore [F32] [F33]                                                                                    | **no (not documented)**                                                                                                                        | **yes**: `/v1/graphql` mirrors the platform REST API [A23]                                                                                                                                        | n/a (not a backend)                                                                                                                                                                                                             |
| 22  | OpenAPI                                       | **yes**: OpenAPI 3.1 at `/api/openapi.json`                                                                                                                                                                                                | **no (not documented)**                                                                                                                                                                                   | **partial**: PostgREST serves a Swagger 2.0 description of your schema at its root. In 2026, anon-key access was removed; use the secret key or the Management API [S31] [S32] [S46]     | **no / unverified**: Google REST reference pages and API Explorer; no OpenAPI document found [F31]                                                                                         | **no (not documented)**                                                                                                                        | **yes**: OpenAPI 3 and Swagger 2 specifications of the Appwrite platform API, published for each release. It is inferred that these describe the platform, not your schema [A24]                  | n/a (not a backend)                                                                                                                                                                                                             |
| 23  | Admin dashboard                               | **planned**: ROADMAP "Administration". Today only the GraphiQL / Apollo Sandbox explorer                                                                                                                                                   | **yes (separate product)**: Parse Dashboard (self-hosted data browser, GraphQL console, multiple apps, read-only users) under a custom Parse LLC licence, not Apache-2.0 [P12]                            | **yes**: Studio. Self-hosted Studio covers a single project behind basic auth [S33] [S45]                                                                                                | **yes**: Firebase console, cloud only [F34]                                                                                                                                                | **yes**: built-in superuser dashboard at `/_/` (collections, settings, cron jobs, backups) [PB1]                                               | **yes**: Console [A25]                                                                                                                                                                            | n/a (not a backend). Prisma Studio is a database GUI, not an application admin [PR23]                                                                                                                                           |
| 24  | Push notifications                            | **no**: not in the roadmap                                                                                                                                                                                                                 | **yes**: APNS and FCM through the push adapter; Installations; targeting by query. Scheduled push is not supported [P2]                                                                                   | **no**: only an example (database webhook, then Edge Function, then Expo or FCM) [S34]                                                                                                   | **yes**: FCM [F35]                                                                                                                                                                         | **no (not documented)**                                                                                                                        | **yes**: Messaging (APNs, FCM), topics and targets [A26]                                                                                                                                          | n/a (not a backend)                                                                                                                                                                                                             |
| 25  | Email                                         | **partial**: auth flows call delivery callbacks supplied by the application; "UltimaBase sends no email"                                                                                                                                   | **yes (adapter)**: an email adapter is required for verification and reset. One is official (`parse-server-api-mail-adapter`), many come from the community [P1]                                          | **partial**: auth emails only. The default sender reaches team members only, about 2 per hour; production needs custom SMTP; Send Email hook [S35]                                       | **partial**: auth emails (templates, action links). General email needs the Trigger Email extension, and Extensions shut down on 2027-03-31 [F36] [F37] [F38] [F49]                        | **yes**: mail client (SMTP or sendmail), templates, mailer hooks [PB16]                                                                        | **yes**: auth templates plus Messaging email providers (Mailgun, SendGrid, Resend, SMTP). Custom SMTP templates need Cloud Pro or above [A26] [A27] [A28]                                         | n/a (not a backend)                                                                                                                                                                                                             |
| 26  | Background jobs                               | **planned**: a BullMQ plugin and a PostgreSQL outbox plugin (ROADMAP)                                                                                                                                                                      | **partial**: `Parse.Cloud.job` runs on demand. The docs say: "We don't support at the moment job scheduling", so use an external scheduler [P4]                                                           | **yes**: Supabase Cron (pg_cron) and Queues (pgmq, "guaranteed to be delivered") [S36] [S37]                                                                                             | **yes**: scheduled functions (Cloud Scheduler) and task queue functions (Cloud Tasks, retries); Blaze required [F39] [F40]                                                                 | **partial**: in-process `cronAdd`; no queue or retries [PB17]                                                                                  | **yes**: scheduled function executions by cron or interval (60-minute minimum on the Free plan) [A20] [A29]                                                                                       | n/a (not a backend)                                                                                                                                                                                                             |
| 27  | Multi-tenancy                                 | **planned**: ROADMAP "Tenant isolation". Today a `RequestContextValue` can carry a tenant                                                                                                                                                  | **no**: "Parse Server does not support multi-tenancy" [P1]                                                                                                                                                | **partial (DIY)**: RLS, schemas or one project per tenant. No official guide found (unverified)                                                                                          | **partial**: Auth tenants through Identity Platform; several Firestore databases per project [F41] [F42]                                                                                   | **no (not documented)** [PB18]                                                                                                                 | **partial**: a documented pattern with one team per tenant [A30]                                                                                                                                  | n/a (not a backend). `multiSchema` allows a do-it-yourself schema per tenant [PR21]                                                                                                                                             |
| 28  | Vector search                                 | **partial / planned**: `pg-vector-plugin` declares `f.vector` but has no storage or search yet (ROADMAP "Vector search")                                                                                                                   | **no**: `fullText` only. Atlas `$vectorSearch` through `aggregate` is unverified                                                                                                                          | **yes**: pgvector. Vector buckets exist on Cloud only [S38]                                                                                                                              | **yes**: Firestore `findNearest` (EUCLIDEAN, COSINE, DOT_PRODUCT); SQL Connect vector search [F43] [F32]                                                                                   | **no**: no vector field type [PB2]                                                                                                             | **yes**: VectorsDB (since 2.0). Disabled by default when self-hosted [A31]                                                                                                                        | n/a (not a backend). v7 uses `Unsupported("vector")` with raw SQL [PR22]                                                                                                                                                        |
| 29  | Typing / editor DX                            | **yes**: full inference from declarations through `Register`, no generation step; client SDK planned                                                                                                                                       | **partial**: the JS SDK ships `.d.ts` files with a generic `Parse.Object<Attributes>` (defaulting to `Record<string, any>`); no schema-derived types [P13]                                                | **yes (codegen)**: `supabase gen types` from the database, re-run after each schema change [S39]                                                                                         | **partial**: Firestore `withConverter` (written by hand); SQL Connect generates typed SDKs [F44] [F10]                                                                                     | **partial**: SDK generics and hand-written types; no official generator [PB19]                                                                 | **yes (codegen)**: `appwrite types` and `appwrite generate` [A32] [A33]                                                                                                                           | **yes (codegen, a core strength)**: `prisma generate` (v7 `prisma-client` generator). Prisma 8 uses `prisma contract emit` [PR11] [PR18]                                                                                        |
| 30  | Local dev & testing                           | **yes**: `@ultimabase/testing` `testApplication` (Testcontainers PostgreSQL, one schema per worker); create-app with Docker Compose; HTTP tests without opening a port                                                                     | **yes**: `mongodb-runner` with the `parse-server` CLI, Docker, or Express mounting. No test harness guide (a `TestUtils` export exists, per the source research) [P1]                                     | **yes**: CLI local stack (Docker) and pgTAP through `supabase test db` [S40] [S41]                                                                                                       | **yes**: Local Emulator Suite (Firestore, Realtime Database, Storage, Auth, Hosting; Functions in beta) and `@firebase/rules-unit-testing` [F45] [F46]                                     | **yes**: the same binary locally; Go test helpers (`NewTestApp`, `ApiScenario`) [PB20]                                                         | **partial**: self-host locally in Docker; `appwrite run functions` (permissions, events and cron do not apply); no test harness documented [A34]                                                  | n/a (not a backend). `prisma dev` runs a local Postgres and there are testing guides [PR12]                                                                                                                                     |
| 31  | Self-hosting                                  | **yes (the only option)**: a Node 24 library inside your process with a Hono listener; no hosted service and no deployment template                                                                                                        | **yes (the only option from the project)**: any Node host, Docker or Express. Hosted Parse (for example Back4App) comes from third-party providers [P1] [P2]                                              | **partial**: Docker Compose. Compared with Cloud, self-hosting lacks branching, managed backups/PITR, analytics and vector buckets, multiple projects and the Management API [S33] [S45] | **no**: Google Cloud only; the emulators are for development [F45]                                                                                                                         | **yes**: a single binary [PB21]                                                                                                                | **yes**: Docker installer and Helm chart; Appwrite Cloud also exists [A35] [A36]                                                                                                                  | n/a (not a backend; a library inside your app) [PR15]                                                                                                                                                                           |
| 32  | Databases                                     | **PostgreSQL only** (Core is database-independent)                                                                                                                                                                                         | **MongoDB** (preferred) and **PostgreSQL** + PostGIS. Version 9.x supports MongoDB 7/8 and Postgres 16–18 [P1] [P2]                                                                                       | **PostgreSQL only** [S1]                                                                                                                                                                 | **Firestore** (Standard; Enterprise, including MongoDB compatibility), **Realtime Database**, **Cloud SQL Postgres** through SQL Connect [F47] [F48] [F32]                                 | **SQLite only**; the FAQ says there are "no plans" for other databases [PB18]                                                                  | Self-hosted **PostgreSQL** (the default since 2.0), **MariaDB** or **MongoDB**, chosen at install; Cloud offers managed PG/MySQL [A37]                                                            | v7: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, CockroachDB (+ managed variants); MongoDB stays on 6.x. v8 RC: PostgreSQL (RC), MongoDB (early access), SQLite (experimental) [PR13] [PR14] [PR30]                          |
| 33  | Extensibility                                 | **yes**: a plugin system with capabilities, privileges and manifests (`plugin-kit`); no community plugins listed yet                                                                                                                       | **yes**: adapters (database, files, email, push, auth, cache, logger), Express middleware and custom routes; no plugin registry [P1] [P11]                                                                | **yes**: 50+ Postgres extensions and database.dev packages [S42]                                                                                                                         | **partial**: Firebase Extensions are deprecated and shut down on 2027-03-31 [F49]                                                                                                          | **yes**: Go framework or JS VM hooks; no plugin marketplace [PB22]                                                                             | **partial**: no plugin system; Functions, webhooks and events [A38]                                                                                                                               | **partial**: v7 client extensions (`$extends`: model, client, query, result), driver adapters, custom generators. Prisma 8 replaces `$extends` with middleware [PR9] [PR18]                                                     |
| 34  | Licence                                       | **Apache-2.0**                                                                                                                                                                                                                             | **Apache-2.0** (server). Parse Dashboard uses a **custom Parse LLC licence** [P1] [P12]                                                                                                                   | **Apache-2.0** (main repo). PostgREST is MIT; licences of the other components were not checked one by one [S43]                                                                         | **Proprietary service**. The JS SDK is Apache-2.0 per the earlier research (the GitHub API reports "NOASSERTION"); firebase-tools is MIT [F50] [F51]                                       | **MIT** [PB23]                                                                                                                                 | **BSD-3-Clause** [A38]                                                                                                                                                                            | **Apache-2.0**. Cloud products (Prisma Postgres, Accelerate) are paid or freemium [PR15] [PR16]                                                                                                                                 |
| 35  | Maturity                                      | **pre-release**: no npm package published and no community plugins                                                                                                                                                                         | **mature**: 9.10.5, LTS for the previous major, frequent releases; many security advisories in 2026 [P14] [P1]                                                                                            | **mature**: widely adopted (~112k stars). Support for self-hosting is community-only [S43]                                                                                               | **mature**: operated by Google, but products are often renamed or deprecated (SQL Connect rename, Extensions shutdown) [F32] [F49]                                                         | **pre-1.0**: v0.40.5. "Full backward compatibility is not guaranteed before v1.0.0"; one maintainer [PB1] [PB18]                               | **post-1.0**: 2.x since 2.0.0; fast release cadence with breaking-change notes [A25]                                                                                                              | n/a (not a backend). The ORM is mature: v7 stable, v8 RC with GA expected in October 2026 [PR17]                                                                                                                                |
| 36  | Full-text search _(added row)_                | **no**: not in the roadmap                                                                                                                                                                                                                 | **yes**: `query.fullText()` with automatic text indexes (documented for MongoDB; on Postgres unverified) [P3]                                                                                             | **yes (Postgres FTS)**: the official page was not fetched, so unverified [S47]                                                                                                           | **partial**: text search only on Firestore Enterprise edition [F53]                                                                                                                        | **no (not documented)**: only the `~` LIKE operator [PB5]                                                                                      | **yes**: `Query.search` with a fulltext index [A6]                                                                                                                                                | n/a (not a backend). v7 offers a Preview full-text search [PR25]                                                                                                                                                                |
| 37  | Geospatial types _(added row)_                | **no**: ROADMAP "Advanced field plugins" lists geo                                                                                                                                                                                         | **yes**: GeoPoint, Polygon and geo queries; Postgres needs PostGIS [P3] [P2]                                                                                                                              | **yes (PostGIS extension)**: page not fetched, unverified [S48]                                                                                                                          | **partial**: GeoPoint type; geoqueries through a geohash recipe (page not fetched) [F54]                                                                                                   | **partial**: `geoPoint` field; its query support is unverified [PB2]                                                                           | **yes**: point, line and polygon columns with spatial queries [A2] [A6]                                                                                                                           | n/a (not a backend)                                                                                                                                                                                                             |
| 38  | Anonymous / guest user accounts _(added row)_ | **no**: there is an anonymous request authority but no anonymous user account; not in the roadmap                                                                                                                                          | **yes**: anonymous users (`enableAnonymousUsers`, on by default) [P5] [P11]                                                                                                                               | **yes**: `signInAnonymously` [S13]                                                                                                                                                       | **yes**: anonymous auth, upgradable to a full account [F14]                                                                                                                                | **unverified**: not documented                                                                                                                 | **yes**: anonymous sessions [A12]                                                                                                                                                                 | n/a (not a backend)                                                                                                                                                                                                             |

### Sources

**Parse Server [P]**. The docs sites are single, very large pages, so cite them with anchors (for example `…/parse-server/guide/#pointer-permissions`).

- P1 https://github.com/parse-community/parse-server (README: compatibility, email adapters, multi-tenancy, access scopes, route allow list, GraphQL, LTS, local and Docker setup)
- P2 https://docs.parseplatform.org/parse-server/guide/ (database caveats, class-level permissions, ACL, pointer permissions, LiveQuery, file adapters, push, third-party auth, deploying)
- P3 https://docs.parseplatform.org/js/guide/ (data types, queries, full-text search, aggregate, relations, users, sessions, roles, geopoints)
- P4 https://docs.parseplatform.org/cloudcode/guide/ (functions, validators, triggers, jobs, "Scheduling a Job")
- P5 https://docs.parseplatform.org/rest/guide/ (objects, users, anonymous authData, sessions, roles, schemas, hooks)
- P6 https://docs.parseplatform.org/graphql/guide/
- P7 https://docs.parseplatform.org/defined-schema/guide/
- P8 https://github.com/parse-community/parse-server/blob/alpha/src/batch.js (`transaction: true`; source only)
- P9 https://github.com/parse-community/parse-server/blob/alpha/src/Adapters/Auth/mfa.js (MFA; source comments only)
- P10 https://github.com/parse-community/parse-server/tree/alpha/src/Adapters/Auth (list of auth adapters)
- P11 https://github.com/parse-community/parse-server/blob/alpha/src/Options/docs.js (options: `schema`, `protectedFields`, `rateLimit`, `enableAnonymousUsers`, `emailAdapter`, `push`, `liveQuery`)
- P12 https://github.com/parse-community/parse-dashboard (README, and LICENSE at `/blob/alpha/LICENSE`)
- P13 https://github.com/parse-community/Parse-SDK-JS (`types/ParseObject.d.ts`)
- P14 https://github.com/parse-community/parse-server/releases

**Supabase [S]**

- S1 https://supabase.com/docs/guides/database/tables
- S2 https://supabase.com/docs/guides/deployment/database-migrations
- S3 https://supabase.com/docs/reference/javascript/rpc
- S4 https://supabase.com/docs/guides/database/joins-and-nesting
- S5 https://supabase.com/docs/guides/realtime
- S6 https://supabase.com/docs/guides/realtime/authorization
- S7 https://supabase.com/docs/guides/storage
- S8 https://supabase.com/docs/guides/storage/security/access-control
- S9 https://supabase.com/docs/guides/auth/passwords
- S10 https://supabase.com/docs/guides/auth
- S11 https://supabase.com/docs/guides/auth/oauth-server
- S12 https://supabase.com/docs/guides/auth/auth-email-passwordless
- S13 https://supabase.com/docs/guides/auth/auth-anonymous
- S14 https://supabase.com/docs/guides/auth/passkeys
- S15 https://supabase.com/docs/guides/auth/auth-mfa
- S16 https://supabase.com/pricing
- S17 https://supabase.com/docs/guides/auth/sessions
- S18 https://supabase.com/docs/guides/database/postgres/row-level-security
- S19 https://supabase.com/docs/guides/database/postgres/column-level-security
- S20 https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- S21 https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- S22 https://supabase.com/docs/guides/functions
- S23 https://supabase.com/docs/guides/database/postgres/triggers
- S24 https://supabase.com/docs/guides/database/webhooks
- S25 https://supabase.com/docs/guides/auth/auth-hooks
- S26 https://supabase.com/docs/guides/database/extensions/pg_jsonschema
- S27 https://supabase.com/docs/guides/troubleshooting/soft-deletes-with-supabase-js
- S28 https://supabase.com/docs/guides/api
- S29 https://supabase.com/docs/guides/graphql
- S30 https://supabase.com/changelog/42180-breaking-change-pg-graphql-no-longer-enabled-automatically-within-approx-3-weeks-from-today
- S31 https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key
- S32 https://supabase.com/docs/reference/api/v1-get-database-openapi
- S33 https://supabase.com/docs/guides/self-hosting
- S34 https://supabase.com/docs/guides/functions/examples/push-notifications
- S35 https://supabase.com/docs/guides/auth/auth-smtp
- S36 https://supabase.com/docs/guides/cron
- S37 https://supabase.com/docs/guides/queues
- S38 https://supabase.com/docs/guides/ai/vector-columns
- S39 https://supabase.com/docs/guides/api/rest/generating-types
- S40 https://supabase.com/docs/guides/local-development
- S41 https://supabase.com/docs/guides/local-development/testing/overview
- S42 https://supabase.com/docs/guides/database/extensions
- S43 https://github.com/supabase/supabase
- S44 https://supabase.com/docs/guides/api/api-keys
- S45 https://supabase.com/docs/guides/self-hosting/docker
- S46 https://github.com/PostgREST/postgrest/blob/main/docs/references/api/openapi.rst (PostgREST OpenAPI output, `"swagger": "2.0"`)
- S47 https://supabase.com/docs/guides/database/full-text-search (nf)
- S48 https://supabase.com/docs/guides/database/extensions/postgis (nf)
- S49 https://supabase.com/docs/guides/auth/signing-keys

**Firebase [F]**

- F1 https://firebase.google.com/docs/firestore/data-model
- F2 https://firebase.google.com/docs/sql-connect/schemas-guide
- F3 https://firebase.google.com/docs/sql-connect/manage-schemas-and-connectors
- F4 https://firebase.google.com/docs/firestore/query-data/queries
- F5 https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- F6 https://firebase.google.com/docs/firestore/enterprise/pipelines-overview
- F7 https://firebase.google.com/docs/firestore/pipelines/perform-joins-with-sub-pipelines
- F8 https://firebase.google.com/docs/firestore/manage-data/transactions
- F9 https://firebase.google.com/docs/firestore/query-data/listen
- F10 https://firebase.google.com/docs/sql-connect/web-sdk
- F11 https://firebase.google.com/docs/storage/security
- F12 https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- F13 https://firebase.google.com/docs/auth/web/password-auth
- F14 https://firebase.google.com/docs/auth
- F15 https://firebase.google.com/docs/auth/web/email-link-auth
- F16 https://firebase.google.com/docs/auth/web/multi-factor
- F17 https://firebase.google.com/docs/auth/web/totp-mfa
- F18 https://docs.cloud.google.com/identity-platform/docs/product-comparison
- F19 https://firebase.google.com/docs/auth/admin/manage-sessions
- F20 https://firebase.google.com/docs/firestore/security/get-started
- F21 https://firebase.google.com/docs/firestore/security/rules-conditions
- F22 https://firebase.google.com/docs/firestore/security/rules-query
- F23 https://firebase.google.com/docs/firestore/security/rules-fields
- F24 https://firebase.google.com/docs/firestore/solutions/role-based-access
- F25 https://firebase.google.com/docs/auth/admin/custom-claims
- F26 https://firebase.google.com/docs/functions
- F27 https://firebase.google.com/docs/functions/firestore-events
- F28 https://firebase.google.com/docs/functions/callable
- F29 https://firebase.google.com/docs/auth/extend-with-blocking-functions
- F30 https://firebase.google.com/docs/firestore/ttl
- F31 https://firebase.google.com/docs/firestore/use-rest-api
- F32 https://firebase.google.com/docs/sql-connect
- F33 https://firebase.google.com/docs/sql-connect/authorization-and-security
- F34 https://console.firebase.google.com (nf)
- F35 https://firebase.google.com/docs/cloud-messaging
- F36 https://firebase.google.com/docs/auth/custom-email-handler
- F37 https://firebase.google.com/docs/auth/admin/email-action-links
- F38 https://github.com/firebase/extensions/tree/next/firestore-send-email (Trigger Email extension)
- F39 https://firebase.google.com/docs/functions/schedule-functions
- F40 https://firebase.google.com/docs/functions/task-functions
- F41 https://docs.cloud.google.com/identity-platform/docs/multi-tenancy
- F42 https://firebase.google.com/docs/firestore/manage-databases
- F43 https://firebase.google.com/docs/firestore/vector-search
- F44 https://firebase.google.com/docs/reference/js/firestore_.firestoredataconverter
- F45 https://firebase.google.com/docs/emulator-suite
- F46 https://firebase.google.com/docs/rules/unit-tests
- F47 https://firebase.google.com/docs/firestore/editions
- F48 https://firebase.google.com/docs/database
- F49 https://firebase.google.com/docs/extensions
- F50 https://github.com/firebase/firebase-js-sdk
- F51 https://github.com/firebase/firebase-tools
- F52 https://firebase.google.com/pricing
- F53 https://firebase.google.com/docs/firestore/solutions/search (text search, Enterprise edition only)
- F54 https://firebase.google.com/docs/firestore/solutions/geoqueries (nf)

**PocketBase [PB]**

- PB1 https://pocketbase.io/docs/
- PB2 https://pocketbase.io/docs/collections/
- PB3 https://pocketbase.io/docs/js-migrations/
- PB4 https://pocketbase.io/docs/go-migrations/
- PB5 https://pocketbase.io/docs/api-records/
- PB6 https://pocketbase.io/docs/api-rules-and-filters/
- PB7 https://pocketbase.io/docs/working-with-relations/
- PB8 https://pocketbase.io/docs/js-collections/
- PB9 https://pocketbase.io/docs/js-database/
- PB10 https://pocketbase.io/docs/api-realtime/
- PB11 https://pocketbase.io/docs/files-handling/
- PB12 https://pocketbase.io/docs/authentication/
- PB13 https://pocketbase.io/jsvm/classes/SelectField.html
- PB14 https://pocketbase.io/docs/js-event-hooks/
- PB15 https://pocketbase.io/docs/js-overview/
- PB16 https://pocketbase.io/docs/js-sending-emails/
- PB17 https://pocketbase.io/docs/js-jobs-scheduling/
- PB18 https://pocketbase.io/faq/
- PB19 https://github.com/pocketbase/js-sdk
- PB20 https://pocketbase.io/docs/go-testing/
- PB21 https://pocketbase.io/docs/going-to-production/
- PB22 https://pocketbase.io/docs/use-as-framework/
- PB23 https://github.com/pocketbase/pocketbase
- PB24 https://github.com/pocketbase/pocketbase/releases (including tag v0.23.0)

**Appwrite [A]**

- A1 https://appwrite.io/docs/products/databases
- A2 https://appwrite.io/docs/products/databases/tablesdb/tables
- A3 https://appwrite.io/docs/advanced/platform/events
- A4 https://appwrite.io/docs/tooling/command-line/tables
- A5 https://appwrite.io/docs/advanced/migrations
- A6 https://appwrite.io/docs/products/databases/tablesdb/queries
- A7 https://appwrite.io/docs/products/databases/tablesdb/relationships
- A8 https://appwrite.io/docs/products/databases/tablesdb/transactions
- A9 https://appwrite.io/docs/apis/realtime
- A10 https://appwrite.io/docs/apis/realtime/channels
- A11 https://appwrite.io/docs/products/storage/buckets
- A12 https://appwrite.io/docs/products/auth
- A13 https://appwrite.io/docs/products/auth/mfa
- A14 https://appwrite.io/docs/products/auth/server-side-rendering
- A15 https://appwrite.io/docs/products/auth/security
- A16 https://appwrite.io/docs/products/databases/tablesdb/permissions
- A17 https://appwrite.io/docs/advanced/platform/permissions
- A18 https://appwrite.io/docs/products/auth/teams
- A19 https://appwrite.io/docs/products/auth/labels
- A20 https://appwrite.io/docs/products/functions/functions
- A21 https://appwrite.io/docs/products/databases/tablesdb/rows
- A22 https://appwrite.io/docs/apis/rest
- A23 https://appwrite.io/docs/apis/graphql
- A24 https://github.com/appwrite/appwrite/tree/master/app/config/specs
- A25 https://github.com/appwrite/appwrite/releases (tags 1.8.0, 2.0.0, 2.5.0)
- A26 https://appwrite.io/docs/products/messaging
- A27 https://appwrite.io/docs/products/auth/message-templates
- A28 https://appwrite.io/docs/advanced/self-hosting/configuration/email
- A29 https://appwrite.io/docs/products/functions/executions
- A30 https://appwrite.io/docs/products/auth/multi-tenancy
- A31 https://appwrite.io/docs/products/databases/vectorsdb
- A32 https://appwrite.io/docs/products/databases/tablesdb/type-generation
- A33 https://appwrite.io/docs/tooling/command-line/generate
- A34 https://appwrite.io/docs/products/functions/develop-locally
- A35 https://appwrite.io/docs/advanced/self-hosting/installation
- A36 https://appwrite.io/docs/advanced/self-hosting
- A37 https://appwrite.io/docs/advanced/self-hosting/configuration/databases
- A38 https://github.com/appwrite/appwrite
- A39 https://appwrite.io/pricing
- A40 https://appwrite.io/docs/advanced/platform/pro
- A41 https://appwrite.io/docs/products/functions/runtimes

**Prisma ORM [PR]**. The unversioned `/docs/orm/...` pages now describe Prisma 8; Prisma 7 pages live under `/docs/orm/v7/`.

- PR1 https://www.prisma.io/docs/orm/v7/prisma-schema/overview
- PR2 https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production
- PR3 https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud
- PR4 https://www.prisma.io/docs/orm/v7/prisma-client/queries/filtering-and-sorting
- PR5 https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing
- PR6 https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations
- PR7 https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries
- PR8 https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
- PR9 https://www.prisma.io/docs/orm/v7/prisma-client/client-extensions
- PR10 https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- PR11 https://www.prisma.io/docs/orm/v7/prisma-client/type-safety
- PR12 https://www.prisma.io/docs/local-development/postgres
- PR13 https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers
- PR14 https://www.prisma.io/docs/orm/v7/reference/supported-databases
- PR15 https://github.com/prisma/prisma
- PR16 https://www.prisma.io/pricing
- PR17 https://www.prisma.io/docs/orm/release-status
- PR18 https://www.prisma.io/docs/orm (Prisma ORM 8 introduction)
- PR19 https://github.com/prisma/prisma-client-extensions
- PR20 https://www.prisma.io/docs/orm/v7/reference/preview-features
- PR21 https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema
- PR22 https://www.prisma.io/docs/orm/v7/prisma-schema/postgresql-extensions
- PR23 https://www.prisma.io/docs/studio (answers 200; the v7 path `/docs/orm/v7/tools/prisma-studio` answers 404)
- PR24 https://github.com/prisma/prisma/discussions/26508 (Pulse deprecation)
- PR25 https://www.prisma.io/docs/orm/v7/prisma-client/queries/full-text-search
- PR26 https://github.com/prisma/prisma/releases
- PR27 https://www.prisma.io/docs/orm/v7/prisma-client/client-extensions/query
- PR28 https://www.prisma.io/docs/orm/v7/prisma-client/queries/pagination
- PR29 https://www.prisma.io/docs/orm/prisma-client/queries/transactions (Prisma 8: `db.transaction`, no isolation-level or timeout option)
- PR30 https://www.prisma.io/docs/orm/reference/supported-databases (Prisma 8 database status)

---

## 2. "Coming from X" mappings

UltimaBase page paths are relative to `apps/website/content/docs/1.0.0/`.
UltimaBase API names come from the docs and from `examples/` in the
repository: `App = UltimaBase.use(...plugins)`, `App.Schema.define(...).with(...)`,
`Model.findMany/findOne/findOneOrThrow/count/exists`,
`createOne/createMany/updateOne/updateMany/upsertOne/deleteOne/deleteMany`,
`{ useMasterKey: true }`, `ultimabase.transaction(fn)`, `Member.signUp/login/logout/current`,
`auth.runWithSession`, `new ACL(...)`, `RoleSchema.define`, `hasRole(...)`,
`softDeleteOne/restoreOne/purgeOne`, `defineOperation`.

### 2.1 Coming from Parse Server

UltimaBase keeps much of Parse's vocabulary: `className`, Pointer, Relation,
ACL, roles, Master key / `useMasterKey`. The mapping is closest here.

| Parse concept                                                      | UltimaBase concept                                                                   | UltimaBase page                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Class (`Parse.Object` subclass), Defined Schema                    | Schema (`App.Schema.define({ className, fields })`)                                  | `core/data-modeling/schemas.mdx`                                                                 |
| Field types (String, Number, Date, Object, Array, GeoPoint, File…) | Fields (`f.string`, `f.int`, `f.date`, `f.object`, `f.json`, `f.binary`…)            | `core/data-modeling/fields.mdx`, `core/data-modeling/embedded-objects.mdx`                       |
| `Parse.Object` instance                                            | Immutable model / item (no `save()` on the item)                                     | `core/data-modeling/models.mdx`                                                                  |
| Pointer / Relation                                                 | `f.pointer` / `f.relation`                                                           | `core/data-modeling/relationships.mdx`                                                           |
| `query.include()`, `matchesQuery`                                  | `include`, relation predicates `some`/`none`/`every`                                 | `core/reading-data/related-data.mdx`, `core/reading-data/filters.mdx`                            |
| `Parse.Query`                                                      | `findMany`/`findOne`/`count`/`exists` with `where`                                   | `core/reading-data/overview.mdx`, `core/reading-data/filters.mdx`                                |
| `limit`/`skip`                                                     | `take`/`skip`, cursor `after`                                                        | `core/reading-data/ordering-and-pagination.mdx`                                                  |
| `/batch` (`transaction: true`)                                     | automatic transaction per mutation, `ultimabase.transaction(fn)`, bulk operations    | `core/writing-data/transactions.mdx`, `core/writing-data/bulk-operations.mdx`                    |
| Master key / `useMasterKey`                                        | Master authority, `{ useMasterKey: true }`, audited                                  | `core/security-foundations/master-authority.mdx`                                                 |
| Session token / `request.user`                                     | Request identity (`RequestContext`), sessions of `auth-plugin`                       | `core/security-foundations/request-identity.mdx`, `plugins/official/password-authentication.mdx` |
| ACL                                                                | Object ACLs plugin (`acl: true`, `new ACL(...)`)                                     | `plugins/official/acl-permissions.mdx`                                                           |
| CLP, pointer permissions, `requiresAuthentication`                 | Access operation and row rules (`.with({ access })`)                                 | `plugins/official/access.mdx`                                                                    |
| `protectedFields`                                                  | Field `access` read and write rules                                                  | `plugins/official/access.mdx`                                                                    |
| `Parse.Role`, child roles                                          | Roles plugin (`RoleSchema`, `includedRoles`, `hasRole`)                              | `plugins/official/roles.mdx`                                                                     |
| Cloud Code `beforeSave`/`afterSave`/`beforeDelete`/`afterDelete`   | Hooks (`resolveInput`, `beforeOperation`, `afterOperation`, `afterCommit`)           | `plugins/official/hooks.mdx`                                                                     |
| `beforeFind`/`afterFind`                                           | no equivalent ("Hooks never run for reads"); use Access read rules or virtual fields | `plugins/official/access.mdx`, `core/data-modeling/virtual-fields.mdx`                           |
| `Parse.Cloud.define` + `Parse.Cloud.run`                           | Custom operation (`defineOperation`), exposed at REST `/operations` and in GraphQL   | `plugins/build-a-plugin/operations-and-graphql.mdx`, `plugins/official/rest.mdx`                 |
| Cloud function validators, `beforeSave` validation                 | Validation plugin (Standard Schema or function)                                      | `plugins/official/validation.mdx`                                                                |
| `_User`, signUp/logIn, email verification, password reset          | `auth-plugin` + password method (`Member.signUp`, `login`, `requestPasswordReset`)   | `plugins/official/password-authentication.mdx`                                                   |
| REST API `/classes/X`                                              | REST plugin `/api/classes/{Class}`                                                   | `plugins/official/rest.mdx`                                                                      |
| Parse GraphQL                                                      | GraphQL plugin                                                                       | `plugins/official/graphql.mdx`                                                                   |
| Express mount / `app.use('/parse', api)`                           | HTTP plugin with a Hono listener                                                     | `plugins/official/http.mdx`, `plugins/official/hono-server.mdx`                                  |
| Adapters (database, files, email, push)                            | Plugins (database adapter plugin; others planned)                                    | `plugins/overview.mdx`, `plugins/official/postgresql.mdx`                                        |
| LiveQuery, Parse.File, Push, Jobs, Dashboard                       | no equivalent yet (realtime, files, jobs and admin are planned; push is not)         | `project/roadmap.mdx`                                                                            |

Common tasks:

| Task                             | Parse                                                                                          | UltimaBase                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Declare a class                  | `new Parse.Schema('Post').addString('title').save()` or Defined Schema `{ className, fields }` | `App.Schema.define({ className: 'Post', fields: (field) => ({ title: field.string({ required: true }) }) })` |
| Create                           | `new Parse.Object('Post').set(...).save()`                                                     | `Post.createOne({ data })`                                                                                   |
| Query                            | `new Parse.Query('Post').equalTo('x', v).include('author').find()`                             | `Post.findMany({ where: { x: { eq: v } }, include: { author: {} } })`                                        |
| Count / first                    | `query.count()`, `query.first()`                                                               | `Post.count({ where })`, `Post.findOne({ where })`                                                           |
| Bypass permissions on the server | `save(null, { useMasterKey: true })`                                                           | `Post.createOne({ data }, { useMasterKey: true })` (audited Master)                                          |
| Per-object permissions           | `new Parse.ACL(user)`, `setRoleReadAccess`                                                     | `acl: true` on the schema, `new ACL(Member.pointer(id)).grantPublic('read')`                                 |
| Class permissions                | CLP through the Schema API                                                                     | `.with({ access: { read: ..., create: ... } })`                                                              |
| Trigger                          | `Parse.Cloud.beforeSave('Post', req => …)`                                                     | `.with({ hooks: { beforeOperation: { create: … } } })`                                                       |
| Cloud function                   | `Parse.Cloud.define('fn', handler, validator)`                                                 | `defineOperation(...)` in a plugin                                                                           |
| Sign up / log in                 | `Parse.User.signUp`, `Parse.User.logIn`                                                        | `Member.signUp(...)`, `Member.login(...)`                                                                    |

Main differences in philosophy:

- **Schema-first and typed.** Parse creates classes on the first client write (`allowClientClassCreation` defaults to false since 7.0). UltimaBase registers every schema explicitly in TypeScript and infers types from those declarations.
- **No Active Record.** `Parse.Object` has `save()`/`destroy()` and dirty tracking. UltimaBase items are immutable values, and every write goes through `Model.createOne/updateOne/...` and one Runtime pipeline.
- **A smaller Core.** Parse Server ships every feature in one package and configures it through server options and adapters. In UltimaBase, Core knows only schemas, queries, operations, transactions and Master. ACL, roles, hooks, auth, REST and GraphQL are plugins you opt into.
- **Master works differently.** In UltimaBase, Master is audited per call. It bypasses authorization only, never validation, hooks, transactions or integrity.
- **Transactions are the default.** Every UltimaBase mutation runs in a transaction, and `afterCommit` runs after commit. In Parse, transactions exist only through `/batch` and are not in the guides.
- **What Parse covers that UltimaBase lacks:** MongoDB support, LiveQuery, files, push, jobs, read triggers, anonymous users, OAuth adapters and a dashboard.

### 2.2 Coming from Supabase

| Supabase concept                                      | UltimaBase concept                                                       | UltimaBase page                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Table (SQL / Table Editor)                            | Schema (TypeScript declaration; the PostgreSQL plugin creates the table) | `core/data-modeling/schemas.mdx`, `plugins/official/postgresql.mdx`                              |
| Column, type, default, NOT NULL                       | Field, `default`, `required`/nullability                                 | `core/data-modeling/fields.mdx`, `core/data-modeling/defaults.mdx`                               |
| Foreign key + embedded select                         | `pointer`/`relation` + `include`                                         | `core/data-modeling/relationships.mdx`, `core/reading-data/related-data.mdx`                     |
| `supabase.from('t').select().eq()`                    | `Model.findMany({ where, select, include })`                             | `core/reading-data/overview.mdx`, `core/reading-data/selections.mdx`                             |
| Postgres function + `.rpc()` for atomic work          | `ultimabase.transaction(fn)`; custom operation                           | `core/writing-data/transactions.mdx`, `plugins/build-a-plugin/operations-and-graphql.mdx`        |
| Migrations (`supabase migration`, `db diff`)          | `schemaPolicy` startup sync; migration plugin planned                    | `plugins/official/postgresql.mdx`                                                                |
| RLS policy (`using (auth.uid() = user_id)`)           | Access row rule returning a `where` filter                               | `plugins/official/access.mdx`                                                                    |
| Column privileges                                     | Field `access` rules                                                     | `plugins/official/access.mdx`                                                                    |
| `service_role` / secret key                           | Master authority                                                         | `core/security-foundations/master-authority.mdx`                                                 |
| `anon` / `authenticated` roles, JWT claims            | Request identity (anonymous authority + session principal)               | `core/security-foundations/request-identity.mdx`, `core/security-foundations/security-model.mdx` |
| RBAC recipe (`user_roles` + Custom Access Token hook) | Roles plugin, `hasRole()`                                                | `plugins/official/roles.mdx`                                                                     |
| Postgres triggers, Database Webhooks, Edge Functions  | Hooks, `afterCommit`, typed events, custom operations, HTTP routes       | `plugins/official/hooks.mdx`, `plugins/official/http.mdx`                                        |
| CHECK constraints, `pg_jsonschema`                    | Validation plugin (Zod/Valibot/ArkType)                                  | `plugins/official/validation.mdx`                                                                |
| Supabase Auth (password)                              | `auth-plugin` + password method                                          | `plugins/official/password-authentication.mdx`                                                   |
| PostgREST `/rest/v1`                                  | REST plugin `/api/classes/{Class}` + OpenAPI 3.1                         | `plugins/official/rest.mdx`                                                                      |
| pg_graphql                                            | GraphQL plugin                                                           | `plugins/official/graphql.mdx`                                                                   |
| `supabase gen types`                                  | none needed: types inferred from declarations                            | `core/data-modeling/schemas.mdx`                                                                 |
| `supabase start` + pgTAP                              | `testApplication` (Testcontainers) + Vitest                              | `guides/test-an-application.mdx`                                                                 |
| pgvector                                              | PostgreSQL Vector plugin (field only today)                              | `plugins/official/postgresql-vector.mdx`                                                         |
| Realtime, Storage, Cron/Queues, Studio                | no equivalent yet (all planned)                                          | `project/roadmap.mdx`                                                                            |

Common tasks:

| Task                     | Supabase                                                              | UltimaBase                                                                       |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Define a table           | `create table posts (...)` + migration                                | `App.Schema.define({ className: 'Post', fields })`                               |
| Read with relation       | `supabase.from('posts').select('*, author(*)').eq('published', true)` | `Post.findMany({ where: { published: { eq: true } }, include: { author: {} } })` |
| Insert / update / delete | `.insert()`, `.update().eq()`, `.delete().eq()`                       | `createOne`, `updateOne`, `deleteOne` (+ `createMany`/`updateMany`/`deleteMany`) |
| Atomic multi-write       | SQL function + `supabase.rpc('fn', args)`                             | `ultimabase.transaction(async () => { … })`                                      |
| Owner-only reads         | `create policy … using (auth.uid() = user_id)`                        | `.with({ access: { read: ({ where }) => … } })`                                  |
| Server bypass            | secret/service key                                                    | `{ useMasterKey: true }`                                                         |
| Sign up / sign in        | `auth.signUp`, `auth.signInWithPassword`                              | `Member.signUp`, `Member.login`                                                  |
| Trigger logic            | Postgres trigger or Database Webhook → Edge Function                  | `hooks: { beforeOperation, afterCommit }`                                        |
| Types                    | `supabase gen types typescript --local`                               | none (inferred)                                                                  |

Main differences in philosophy:

- **Where the logic lives.** Supabase treats Postgres as the application server: SQL schema, RLS, SQL functions and triggers, with thin clients over PostgREST. UltimaBase keeps schema, rules, validation and hooks in TypeScript, in one Node process, and treats Postgres as storage. In Supabase guidance the developer still writes SQL; in UltimaBase the developer never writes SQL or Drizzle.
- **Authorization defaults.** RLS is opt-in per table, and Supabase now also requires an explicit GRANT before the API exposes a table. UltimaBase's Access is deny-by-default once the plugin is installed.
- **Transactions.** Supabase transactions need a SQL function. UltimaBase wraps every mutation automatically and lets server code group writes with `ultimabase.transaction`.
- **Platform scope.** Supabase is a hosted platform (with partial self-hosting) that includes auth, storage, realtime, functions, cron and a dashboard. UltimaBase is a library you deploy yourself and does not yet have those services.

### 2.3 Coming from Firebase

| Firebase concept                                         | UltimaBase concept                                                            | UltimaBase page                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Collection / document (schemaless)                       | Schema / item (declared, typed)                                               | `core/data-modeling/schemas.mdx`, `core/data-modeling/models.mdx`                 |
| Map field, nested data                                   | Embedded object field (`f.object`)                                            | `core/data-modeling/embedded-objects.mdx`                                         |
| Document reference, subcollection                        | `pointer` / `relation`                                                        | `core/data-modeling/relationships.mdx`                                            |
| `query(collection, where, orderBy, limit)` + `getDocs`   | `findMany({ where, orderBy, take })`                                          | `core/reading-data/overview.mdx`, `core/reading-data/ordering-and-pagination.mdx` |
| `startAfter` cursors                                     | `after` cursor                                                                | `core/reading-data/ordering-and-pagination.mdx`                                   |
| `getCountFromServer` / `count()`                         | `count`, `exists`                                                             | `core/reading-data/overview.mdx`                                                  |
| `runTransaction`, `writeBatch`                           | automatic transaction, `ultimabase.transaction`, bulk operations              | `core/writing-data/transactions.mdx`, `core/writing-data/bulk-operations.mdx`     |
| Security Rules (`allow read: if …`)                      | Access rules (operation, row, field)                                          | `plugins/official/access.mdx`                                                     |
| Rules data validation                                    | Validation plugin                                                             | `plugins/official/validation.mdx`                                                 |
| Custom claims (`request.auth.token.admin`)               | Roles plugin, `hasRole()`                                                     | `plugins/official/roles.mdx`                                                      |
| Admin SDK (bypasses rules)                               | Master authority (bypasses authorization only, audited)                       | `core/security-foundations/master-authority.mdx`                                  |
| Firebase Auth (email/password)                           | `auth-plugin` + password method                                               | `plugins/official/password-authentication.mdx`                                    |
| ID token + refresh token                                 | Opaque session token (Bearer or cookie), refresh                              | `plugins/official/password-authentication.mdx`                                    |
| Cloud Functions Firestore triggers                       | Hooks (`beforeOperation` runs inside the transaction, `afterCommit` after it) | `plugins/official/hooks.mdx`                                                      |
| Callable / HTTPS functions                               | Custom operations, HTTP routes                                                | `plugins/build-a-plugin/operations-and-graphql.mdx`, `plugins/official/http.mdx`  |
| Emulator Suite + rules-unit-testing                      | `testApplication` (real PostgreSQL in Testcontainers)                         | `guides/test-an-application.mdx`                                                  |
| `withConverter` / SQL Connect generated SDK              | Inferred types (client SDK planned)                                           | `core/data-modeling/schemas.mdx`, `project/roadmap.mdx`                           |
| SQL Connect GraphQL                                      | GraphQL plugin                                                                | `plugins/official/graphql.mdx`                                                    |
| `onSnapshot`, Storage, FCM, scheduled functions, console | no equivalent yet (realtime, files, jobs and admin are planned; push is not)  | `project/roadmap.mdx`                                                             |

Common tasks:

| Task          | Firebase                                                                                                   | UltimaBase                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Read one      | `getDoc(doc(db, 'posts', id))`                                                                             | `Post.findOneOrThrow({ where: { id: { eq: id } } })`                             |
| Query         | `getDocs(query(collection(db, 'posts'), where('published', '==', true), orderBy('createdAt'), limit(20)))` | `Post.findMany({ where: { published: { eq: true } }, orderBy: …, take: 20 })`    |
| Write         | `addDoc`, `setDoc(…, { merge })`, `updateDoc`, `deleteDoc`                                                 | `createOne`, `upsertOne`, `updateOne`, `deleteOne`                               |
| Atomic write  | `runTransaction(db, async tx => …)`                                                                        | `ultimabase.transaction(async () => …)` (each single mutation is already atomic) |
| Access rule   | `allow read: if resource.data.published == true`                                                           | `access: { read: ({ where }) => where.eq('published', true) }`                   |
| Admin role    | `setCustomUserClaims(uid, { admin: true })` + `request.auth.token.admin`                                   | role membership + `hasRole(Admin)` in an Access rule                             |
| Trigger       | `onDocumentCreated('posts/{id}', handler)`                                                                 | `hooks: { afterCommit: { create: … } }`                                          |
| Sign in       | `signInWithEmailAndPassword(auth, email, pw)`                                                              | `Member.login(...)`                                                              |
| Local testing | `firebase emulators:start` + `assertFails`                                                                 | `testApplication` + Vitest                                                       |

Main differences in philosophy:

- **Data model.** Firestore is schemaless and denormalized, with no joins on the Standard edition. UltimaBase is relational (PostgreSQL), declared and typed, with relations, `include` and nested writes.
- **Rules as filters.** Firestore rules are "not filters": a client query must repeat the rule's constraints or it fails. UltimaBase compiles the row rule into the query, so a read returns only the allowed rows.
- **Server trust.** The Firebase Admin SDK bypasses Security Rules, and with them the validation written in rules. UltimaBase Master bypasses authorization only; validation and hooks still run.
- **Where the code runs.** Firebase clients talk to Google services directly, and server code runs in Cloud Functions (Blaze plan). UltimaBase is your own Node server; clients reach it through REST or GraphQL, and a client SDK is planned.
- **Hosting and pricing.** Firebase is cloud-only with pay-as-you-go tiers (Blaze is required for Functions, Storage and SQL Connect after the trial). UltimaBase is free, self-hosted software.

### 2.4 Coming from PocketBase

| PocketBase concept                                  | UltimaBase concept                                                                           | UltimaBase page                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Collection (base)                                   | Schema                                                                                       | `core/data-modeling/schemas.mdx`                                                                 |
| Auth collection, `_superusers`                      | Auth plugin user schema; Master authority                                                    | `plugins/official/password-authentication.mdx`, `core/security-foundations/master-authority.mdx` |
| View collection                                     | no direct equivalent (virtual fields cover computed values)                                  | `core/data-modeling/virtual-fields.mdx`                                                          |
| Field (text, number, select, json, relation, file…) | Field (`f.string`, `f.int`, `f.enum`, `f.json`, `f.pointer`/`f.relation`; no file field yet) | `core/data-modeling/fields.mdx`                                                                  |
| `expand`, back-relations `_via_`                    | `include`, inverse `relation` (`mappedBy`)                                                   | `core/reading-data/related-data.mdx`, `core/data-modeling/relationships.mdx`                     |
| Filter string (`title ~ {:q} && status = "x"`)      | Typed `where` object                                                                         | `core/reading-data/filters.mdx`                                                                  |
| `page`/`perPage`, `skipTotal`                       | `take`/`skip`, cursor `after`, `count`                                                       | `core/reading-data/ordering-and-pagination.mdx`                                                  |
| API rules (list/view/create/update/delete)          | Access rules (read row filter, operation rules)                                              | `plugins/official/access.mdx`                                                                    |
| `@request.auth`, `@request.body.x:changed`          | Request identity; field write rules; hooks                                                   | `core/security-foundations/request-identity.mdx`, `plugins/official/access.mdx`                  |
| `hidden` field                                      | Field `access: { read: false }`                                                              | `plugins/official/access.mdx`                                                                    |
| `pb_migrations`, automigrate                        | `schemaPolicy` sync; migration plugin planned                                                | `plugins/official/postgresql.mdx`                                                                |
| `$app.runInTransaction`, `/api/batch`               | `ultimabase.transaction`, bulk operations                                                    | `core/writing-data/transactions.mdx`, `core/writing-data/bulk-operations.mdx`                    |
| JS/Go hooks (`onRecordCreate`, `e.next()`)          | Hooks plugin                                                                                 | `plugins/official/hooks.mdx`                                                                     |
| `routerAdd`                                         | HTTP routes, custom operations                                                               | `plugins/official/http.mdx`                                                                      |
| Go framework (`pocketbase.New()` + hooks)           | Plugins (`definePlugin`)                                                                     | `plugins/build-a-plugin/index.mdx`                                                               |
| `NewTestApp`, `ApiScenario`                         | `testApplication`                                                                            | `guides/test-an-application.mdx`                                                                 |
| Realtime SSE, files, mailer, `cronAdd`, Dashboard   | no equivalent yet (realtime, files, jobs and admin are planned; general email is not)        | `project/roadmap.mdx`                                                                            |

Common tasks:

| Task                     | PocketBase                                                                                | UltimaBase                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Define a collection      | Dashboard or `new Collection({...})` + `$app.save()` in a migration                       | `App.Schema.define({...})`                                                                 |
| List with filter         | `pb.collection('posts').getList(1, 20, { filter: 'published = true', expand: 'author' })` | `Post.findMany({ where: { published: { eq: true } }, include: { author: {} }, take: 20 })` |
| Get one                  | `getOne(id)` / `getFirstListItem(filter)`                                                 | `findOneOrThrow({ where })` / `findOne({ where })`                                         |
| Create / update / delete | `create`, `update`, `delete`                                                              | `createOne`, `updateOne`, `deleteOne`                                                      |
| Atomic batch             | `pb.createBatch()…send()`                                                                 | `ultimabase.transaction(...)` or `createMany`                                              |
| Rule                     | listRule `@request.auth.id = author`                                                      | `access: { read: … }` row filter                                                           |
| Hook                     | `onRecordCreateRequest((e) => { …; e.next() }, 'posts')`                                  | `hooks: { beforeOperation: { create: … } }`                                                |
| Auth                     | `authWithPassword`, `authRefresh`, `authStore.clear()`                                    | `Member.login`, `Member.refresh`, `Member.logout`                                          |

Main differences in philosophy:

- **Packaging.** PocketBase is a single Go binary over SQLite with a dashboard built in; you extend it in Go or a sandboxed JS VM. UltimaBase is a TypeScript library on PostgreSQL that runs inside your Node process.
- **Scale.** PocketBase scales vertically only (embedded SQLite). UltimaBase relies on a PostgreSQL server.
- **Policy expression.** PocketBase rules are filter strings. UltimaBase rules are typed TypeScript functions, and it adds per-object ACLs and role hierarchies, which PocketBase lacks.
- **Sessions.** PocketBase tokens are stateless JWTs with no server-side revocation. UltimaBase stores opaque sessions that can be listed and revoked.
- **Shared status, fewer built-ins.** Both are pre-1.0. PocketBase already ships realtime, files, OAuth2, MFA, email and cron; UltimaBase does not.

### 2.5 Coming from Appwrite

| Appwrite concept                                               | UltimaBase concept                                                        | UltimaBase page                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Project                                                        | Application (`ultimabase.start()`)                                        | `core/application.mdx`                                                            |
| Database > table (TablesDB; formerly collection)               | Schema                                                                    | `core/data-modeling/schemas.mdx`                                                  |
| Column (formerly attribute)                                    | Field                                                                     | `core/data-modeling/fields.mdx`                                                   |
| Row (formerly document)                                        | Item / model                                                              | `core/data-modeling/models.mdx`                                                   |
| Relationship column (onDelete)                                 | `pointer` (onDelete) / `relation`                                         | `core/data-modeling/relationships.mdx`                                            |
| `Query.equal`, `Query.orderDesc`, `Query.limit`, `cursorAfter` | `where`, `orderBy`, `take`, `after`                                       | `core/reading-data/filters.mdx`, `core/reading-data/ordering-and-pagination.mdx`  |
| `Query.select(['*', 'rel.*'])`                                 | `select`, `include`                                                       | `core/reading-data/selections.mdx`, `core/reading-data/related-data.mdx`          |
| `createTransaction` / `updateTransaction({ commit })`          | automatic transaction, `ultimabase.transaction(fn)`                       | `core/writing-data/transactions.mdx`                                              |
| Table permissions                                              | Access operation rules                                                    | `plugins/official/access.mdx`                                                     |
| Row security, `$permissions`                                   | Object ACLs (`acl: true`)                                                 | `plugins/official/acl-permissions.mdx`                                            |
| `Role.team(id, role)`, labels                                  | Roles plugin (`includedRoles`, `hasRole`)                                 | `plugins/official/roles.mdx`                                                      |
| API key (server)                                               | Master authority                                                          | `core/security-foundations/master-authority.mdx`                                  |
| Account sessions                                               | `auth-plugin` sessions                                                    | `plugins/official/password-authentication.mdx`                                    |
| Functions (event or HTTP triggered)                            | Hooks (synchronous, in the transaction), `afterCommit`, custom operations | `plugins/official/hooks.mdx`, `plugins/build-a-plugin/operations-and-graphql.mdx` |
| REST `/v1`, GraphQL `/v1/graphql`                              | REST plugin, GraphQL plugin                                               | `plugins/official/rest.mdx`, `plugins/official/graphql.mdx`                       |
| `appwrite types` / `appwrite generate`                         | inferred types                                                            | `core/data-modeling/schemas.mdx`                                                  |
| VectorsDB                                                      | PostgreSQL Vector plugin (field only)                                     | `plugins/official/postgresql-vector.mdx`                                          |
| Storage, Messaging, Realtime, Console, Sites                   | no equivalent yet (some planned)                                          | `project/roadmap.mdx`                                                             |

Common tasks:

| Task           | Appwrite                                                                                  | UltimaBase                                                        |
| -------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Create a table | Console, `tablesDB.createTable` + column methods, or `appwrite push tables`               | `App.Schema.define({...})`                                        |
| Create a row   | `tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data, permissions })`      | `Post.createOne({ data })` (+ `acl` when the ACL plugin is on)    |
| List rows      | `tablesDB.listRows({ queries: [Query.equal('published', true), Query.limit(25)] })`       | `Post.findMany({ where: { published: { eq: true } }, take: 25 })` |
| Permissions    | `[Permission.read(Role.team('t', ['admin']))]`                                            | `new ACL(...)` grants; Access rule with `hasRole`                 |
| Transaction    | `createTransaction` → writes with `transactionId` → `updateTransaction({ commit: true })` | `ultimabase.transaction(async () => …)`                           |
| Sign in        | `account.createEmailPasswordSession`                                                      | `Member.login`                                                    |
| Server logic   | `functions.createExecution` / event-triggered Function                                    | `hooks`, `defineOperation`                                        |

Main differences in philosophy:

- **Platform or library.** Appwrite is a multi-service platform (Docker or Cloud) used from client and server SDKs, administered from a Console, with logic in isolated Functions. UltimaBase is one library inside your server process.
- **When logic runs.** Appwrite Functions are triggered asynchronously by events, and no synchronous before-write hook is documented. UltimaBase hooks run inside the write's transaction, with a separate post-commit stage.
- **Types.** Appwrite generates types with its CLI. UltimaBase infers them from the declarations.
- **Breadth.** Appwrite ships realtime, storage, messaging (push, email, SMS), MFA, OAuth, Sites and databases on several engines. UltimaBase covers data, authorization and password auth today.

### 2.6 Coming from Prisma ORM

Prisma is the closest comparison for the data layer only. This mapping covers Prisma 7 (stable) and notes Prisma 8 (RC).

| Prisma concept                                                | UltimaBase concept                                                | UltimaBase page                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `model` in `schema.prisma` (Prisma 8: `contract.prisma`)      | Schema in TypeScript                                              | `core/data-modeling/schemas.mdx`                                   |
| Scalar fields, `@default`, `?` optional                       | Fields, defaults, nullability                                     | `core/data-modeling/fields.mdx`, `core/data-modeling/defaults.mdx` |
| `@relation`, 1-n / m-n                                        | `pointer`, `relation` (`mappedBy`)                                | `core/data-modeling/relationships.mdx`                             |
| `@unique`, `@@index`                                          | `indexes` in `define`                                             | `core/data-modeling/schemas.mdx`                                   |
| `Json` type                                                   | `f.json` / embedded objects                                       | `core/data-modeling/embedded-objects.mdx`                          |
| `findMany({ where, include, select, orderBy, take, cursor })` | `findMany({ where, include, select, orderBy, take, after })`      | `core/reading-data/overview.mdx`                                   |
| `some` / `every` / `none`                                     | same names                                                        | `core/reading-data/filters.mdx`                                    |
| Nested writes `connect`/`create`/`disconnect`/`set`           | Nested writes with the same verbs                                 | `core/writing-data/nested-writes.mdx`                              |
| `upsert`                                                      | `upsertOne` (unique upserts)                                      | `core/writing-data/upserts.mdx`                                    |
| `$transaction`                                                | automatic transaction per mutation + `ultimabase.transaction(fn)` | `core/writing-data/transactions.mdx`                               |
| `prisma migrate dev` / `deploy`                               | `schemaPolicy` (`override` / `fail`); migration plugin planned    | `plugins/official/postgresql.mdx`                                  |
| `prisma generate` (Prisma 8: `prisma contract emit`)          | none (inferred)                                                   | `core/data-modeling/schemas.mdx`                                   |
| Client extensions (`$extends` query)                          | Hooks, plugins                                                    | `plugins/official/hooks.mdx`, `plugins/overview.mdx`               |
| Driver adapter (`PrismaPg`)                                   | PostgreSQL plugin                                                 | `plugins/official/postgresql.mdx`                                  |
| (none: Prisma has no authorization, API or auth)              | Access, ACL, Roles, Auth, REST, GraphQL plugins                   | `plugins/overview.mdx`                                             |

Common tasks:

| Task                    | Prisma 7                                                                  | UltimaBase                                                                              |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Declare a model         | `model Post { id String @id; title String }` → `migrate dev` → `generate` | `App.Schema.define({ className: 'Post', fields })` (no generate step)                   |
| Query with relation     | `prisma.post.findMany({ where, include: { author: true } })`              | `Post.findMany({ where, include: { author: {} } })`                                     |
| Create with nested      | `prisma.post.create({ data: { author: { connect: { id } } } })`           | `Post.createOne({ data: { author: { connect: … } } })`                                  |
| Interactive transaction | `prisma.$transaction(async tx => …)`                                      | `ultimabase.transaction(async () => …)` (async-scope propagation, so no `tx` parameter) |
| Intercept queries       | `$extends({ query: { $allModels: { $allOperations } } })`                 | global or schema hooks                                                                  |
| Raw SQL                 | `$queryRaw` / TypedSQL                                                    | not exposed ("the developer never writes SQL")                                          |

Main differences in philosophy:

- **ORM or backend.** Prisma is a typed database client. Authorization, validation, hooks, APIs and auth are left to the application. UltimaBase is a backend framework whose operation engine enforces policies, validation, hooks and transactions on every call, whether it comes from server code, REST or GraphQL.
- **Code generation.** Prisma generates a client from a separate schema language. UltimaBase infers everything from TypeScript declarations.
- **Raw SQL.** Prisma offers raw SQL as an escape hatch. UltimaBase has no SQL in user code, so nothing can bypass the Runtime.
- **API stability.** Prisma 8 (RC, `prisma@latest` on npm) changes the schema file, the generation command, the query shape and the transaction API, and drops `$extends`. Any "coming from Prisma" page should say which major it targets.

---

## 3. Gap list for UltimaBase (verified)

Ranking: the number of the five backends (Parse, Supabase, Firebase,
PocketBase, Appwrite) offering the capability fully, then the number offering
it partially. Prisma is excluded from the count. The ROADMAP column cites
`/Users/mrekinox/Desktop/ub-small/ROADMAP.md`.

| Rank | Capability (UB status)                                                      | Parse                                             | Supabase                  | Firebase                         | PocketBase                                   | Appwrite               | Full / partial                | In ROADMAP?                                                                                                          |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------- | -------------------------------- | -------------------------------------------- | ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Realtime (planned)                                                          | yes [P2]                                          | yes [S5]                  | yes [F9]                         | yes [PB10]                                   | yes [A9]               | 5 / 0                         | **Yes**: "Realtime" (contract, in-memory adapter, then Redis)                                                        |
| 1    | File storage (planned)                                                      | yes [P2]                                          | yes [S7]                  | yes, Blaze only [F11] [F12]      | yes [PB11]                                   | yes [A11]              | 5 / 0                         | **Yes**: "File fields"                                                                                               |
| 1    | OAuth / social sign-in (planned)                                            | yes [P10]                                         | yes [S10]                 | yes [F14]                        | yes [PB12]                                   | yes [A12]              | 5 / 0                         | **Yes**: "More authentication" (Google, GitHub, OIDC, PKCE, mobile ID token) + Better Auth plugin                    |
| 1    | Admin dashboard (planned)                                                   | yes, separate product with a custom licence [P12] | yes [S33]                 | yes [F34]                        | yes [PB1]                                    | yes [A25]              | 5 / 0                         | **Yes**: "Administration"                                                                                            |
| 1    | Client SDK for browsers and mobile (planned)                                | yes [P13]                                         | yes (supabase-js) [S3]    | yes [F50]                        | yes [PB19]                                   | yes [A38]              | 5 / 0                         | **Yes**: "TypeScript SDK", "React Query SDK"                                                                         |
| 6    | MFA (planned)                                                               | yes, documented only in source [P9]               | yes (phone is paid) [S15] | partial, Identity Platform [F16] | yes [PB12]                                   | yes [A13]              | 4 / 1                         | **Yes**: "two-factor authentication and passkeys" after OAuth                                                        |
| 7    | Anonymous user accounts (no)                                                | yes [P5]                                          | yes [S13]                 | yes [F14]                        | unverified                                   | yes [A12]              | 4 / 0                         | No                                                                                                                   |
| 8    | Background jobs / scheduling (planned)                                      | partial, no scheduling [P4]                       | yes [S36] [S37]           | yes [F39] [F40]                  | partial, in-process cron [PB17]              | yes [A20]              | 3 / 2                         | **Yes**: "Background jobs" (BullMQ) + "Reliable event delivery" (outbox)                                             |
| 9    | Email sending (partial: callbacks only)                                     | yes (adapter) [P1]                                | partial, auth only [S35]  | partial [F36] [F38]              | yes [PB16]                                   | yes [A26]              | 3 / 2                         | No (by design, the application delivers)                                                                             |
| 10   | Magic link / passwordless (no)                                              | no                                                | yes [S12]                 | yes [F15]                        | partial (OTP) [PB12]                         | yes [A12]              | 3 / 1                         | No (passkeys are planned, not magic links)                                                                           |
| 10   | Full-text search (no)                                                       | yes [P3]                                          | yes, unverified [S47]     | partial, Enterprise only [F53]   | no                                           | yes [A6]               | 3 / 1                         | No                                                                                                                   |
| 12   | Vector search (partial: field only)                                         | no                                                | yes [S38]                 | yes [F43]                        | no                                           | yes [A31]              | 3 / 0                         | **Yes**: "Vector search" (finish pg-vector, then a neutral `vector` plugin)                                          |
| 12   | Push notifications (no)                                                     | yes [P2]                                          | no [S34]                  | yes [F35]                        | no                                           | yes [A26]              | 3 / 0                         | No                                                                                                                   |
| 14   | Geospatial types (no)                                                       | yes [P3]                                          | yes, unverified [S48]     | partial [F54]                    | partial [PB2]                                | yes [A2]               | 3 / 2 (with unverified cells) | **Partly**: "Advanced field plugins" lists geo                                                                       |
| 15   | Versioned migrations (partial: startup sync)                                | partial [P7]                                      | yes [S2]                  | partial, SQL Connect only [F3]   | yes [PB3]                                    | partial [A4]           | 2 / 3                         | **Yes**: "PostgreSQL migrations" (snapshots, plans, locking, CLI)                                                    |
| 16   | Aggregations beyond count (sum/avg/groupBy) (no)                            | yes, master key only [P3]                         | unverified                | yes (count/sum/average) [F5]     | no (not documented) [PB5]                    | unverified             | 2 / 0 (2 unverified)          | No                                                                                                                   |
| 17   | Read hooks (before/after find) (no, by design: "Hooks never run for reads") | yes [P4]                                          | no                        | no                               | yes (`onRecordEnrich`, request hooks) [PB14] | no                     | 2 / 0                         | No                                                                                                                   |
| 18   | Multi-tenancy (planned)                                                     | no [P1]                                           | partial (DIY, unverified) | partial [F41]                    | no                                           | partial [A30]          | 0 / 3                         | **Yes**: "Tenant isolation"                                                                                          |
| —    | Databases other than PostgreSQL (PostgreSQL only)                           | MongoDB [P1]                                      | no                        | Firestore / RTDB [F47]           | SQLite [PB18]                                | MariaDB, MongoDB [A37] | 4 offer a non-PG engine       | No adapter planned. ROADMAP only says the future `vector` plugin will have "one implementation per database adapter" |
| —    | Managed hosting (none)                                                      | third-party providers only [P1]                   | yes [S16]                 | yes, cloud only [F52]            | no                                           | yes (Cloud) [A39]      | 3 / 0                         | No ("Publication decision" covers docs hosting, not a service)                                                       |

UltimaBase is also absent from **rate limiting** (it has only auth attempt
limiting) and **SAML SSO**. The rows above did not research these in depth.
Parse has `rateLimit` [P11], and Supabase offers SAML SSO on Pro and above
[S16].

---

## 4. Where UltimaBase is ahead or different (claims checked)

Each claim was checked against the matrix. Claims that another system matches
were dropped, as listed at the end.

**Kept**

1. **End-to-end types inferred from declarations, with no generation step.**
   Supabase [S39], Appwrite [A32] and Prisma (v7 `generate`, v8 `contract emit`) [PR11] [PR18]
   generate code. Firebase uses hand-written converters or SQL Connect
   codegen [F44] [F10]. PocketBase [PB19] and Parse [P13] rely on hand-written
   generics. Among these six, only UltimaBase infers item, filter, relation and
   policy types straight from the TypeScript schema. Scope the wording to
   "the systems compared here": other TypeScript ORMs outside this comparison
   also infer types.
2. **Built-in soft delete with restore, purge and a read permission for deleted rows.**
   None of the others has it built in. Supabase [S27], Firebase [F30] and
   Prisma [PR27] document do-it-yourself patterns; Parse, PocketBase and
   Appwrite do not document it.
3. **Standard Schema validation (Zod, Valibot, ArkType) attached to the schema.**
   The others validate with their own mechanisms: Parse validators [P4],
   Postgres constraints or `pg_jsonschema` [S26], Security Rules [F21],
   PocketBase field options [PB8], Appwrite column constraints [A2].
4. **Arbitrary predicate row rules together with first-class per-object ACLs and role hierarchies, in one policy stack.**
   - Parse has ACL, roles and CLPs but no general predicate rules; it relies on
     `beforeFind` rewriting [P2] [P4].
   - Supabase has predicate RLS, but ACLs and RBAC are do-it-yourself
     [S18] [S21].
   - Appwrite has row permissions and teams, but no predicate rules [A16] [A17].
   - PocketBase has predicate rules but no ACLs or roles [PB6].
   - Firebase has predicate rules that are "not filters", plus claims-based
     roles [F22] [F25].
5. **TypeScript hooks that run inside the write's database transaction, with a separate post-commit stage.**
   - Firebase triggers run after the write [F27].
   - Appwrite Functions are event-driven and asynchronous [A3].
   - Parse documents no transactional guarantee for triggers (unverified either way).
   - Supabase reaches in-transaction logic only through Postgres triggers in SQL [S23].
   - PocketBase hooks wrap persistence (`e.next()`), but whether they run in the same transaction is unverified.

   Phrase the claim as "documented", and name Supabase's SQL triggers as the
   SQL-side equivalent.

6. **A Master bypass that never skips validation or hooks, and is audited per call.**
   The Firebase Admin SDK bypasses Security Rules, and with them the
   validation written in rules [F20] [F21]. Supabase's secret key bypasses RLS
   but not constraints or triggers [S18]. Parse's master key bypasses ACLs and
   CLPs while triggers still run [P1]. So the difference is clear-cut only
   against Firebase. The per-call audit requirement is specific to UltimaBase;
   no equivalent was found elsewhere.
7. **An application-specific OpenAPI 3.1 document.** Supabase/PostgREST
   produces a Swagger 2.0 document, and anon-key access was removed in 2026
   [S46] [S31]. Appwrite publishes OpenAPI 3 for its platform API, not for
   your schema [A24] (the "not for your schema" part is inferred). Parse,
   PocketBase and Firebase publish none.
8. **A plugin system that can contribute fields, schema features, rules, operations and GraphQL with declared capabilities and privileges.**
   Parse has adapters [P1], PocketBase is a Go framework [PB22], Supabase has
   Postgres extensions [S42], Appwrite has no plugin system [A38], and Firebase
   Extensions are being shut down [F49]. Be honest that the ecosystem is
   empty: there are no community plugins yet.

**Different, not ahead**

- **Embedded library in your own process.** Parse is also Express middleware
  [P1], PocketBase is also a Go framework [PB22], and Prisma is a library.
  Present it as "like Parse Server", not as unique.
- **Server-side, revocable sessions.** Parse [P5], Appwrite [A14] and
  Supabase [S17] have them too. It is an advantage over PocketBase's stateless
  JWTs [PB12] only.
- **Testing harness.** Firebase's Emulator Suite with rules-unit-testing
  [F45] [F46], Supabase's pgTAP [S41] and PocketBase's Go helpers [PB20] are
  comparable. UltimaBase's distinguishing points are TypeScript/Vitest, real
  PostgreSQL in Testcontainers, a schema per worker, and HTTP tests without a
  port.

**Dropped (matched by another system)**

- "REST and GraphQL generated from the same schema": Parse does this [P5] [P6], and Appwrite exposes GraphQL for its whole API [A23].
- "Row rules compiled into the query as filters": Supabase RLS [S18], PocketBase rules [PB6] and Appwrite row permissions [A16] filter results too.
- "Field-level read permissions": Parse `protectedFields` [P11] and Supabase column privileges [S19] cover this.
- "`onDelete` restrict/cascade/setNull": Appwrite [A7], and PocketBase `cascadeDelete` [PB7].
- "Nested writes with connect/create/disconnect/set": Prisma 7 has these [PR7]. Among the backends, none of the official sources checked here shows them, but this was not exhaustively verified, so do not claim it.
- "Open-source licence": all except Firebase are open source; Apache-2.0 is shared with Parse Server, Supabase and Prisma.

---

## 5. Accuracy risks and maintenance notes

**General**

- The comparison page should give a "checked on 2026-10-17" date and the
  versions in the table at the top of this file. Plan a re-check every
  release cycle (quarterly at minimum).
- Cells marked unverified or (nf) must not appear as facts in public
  documentation without another fetch. Today these are:
  - Supabase: full-text search, PostGIS, multi-tenancy guide, aggregations.
  - Firebase: geoqueries, OpenAPI, passkeys, Firestore `or()` limits, session-cookie lifetime.
  - PocketBase: anonymous users, geoPoint queries, full-text search.
  - Appwrite: aggregations, numeric min/max, exact token and file method names.
  - Parse: vector search through Atlas, full-text search on Postgres.
  - Prisma: the official Pulse shutdown notice and the Prisma Studio licence.

**Parse Server**

- The 9.x line moves quickly. 9.10.5 shipped on 2026-10-16, with many 2026
  security advisories (auth adapters, LiveQuery `$or` leaks, prototype
  pollution, an `$relatedTo` ACL bypass). Quote the current patch.
- 10.0 is pending (DEPRECATIONS.md):
  - the GraphQL Playground is removed;
  - `protectedFields` defaults change;
  - `enableLiveQueryClassLevelPermissionRoles` becomes true;
  - `requestComplexity` is on by default.
- Database support is time-boxed in the README: 9.x supports MongoDB 7/8 and
  Postgres 16–18 [P1].
- MFA and batch transactions are documented only in source code [P8] [P9].
  Link to the source files and say so.
- Parse Dashboard is not Apache-2.0. Its LICENSE is a custom Parse LLC
  licence, while its README badge says "BSD" [P12].
- Hosted "Parse" offerings (Back4App and others) are third parties. Do not
  attribute their features or pricing to Parse Server.
- The docs sites are single very large pages, so cite them with anchors.

**Supabase**

- Several breaking platform changes landed in 2026:
  - new public tables are not exposed without a GRANT (all projects from 2026-10-30) [S20];
  - pg_graphql is no longer enabled automatically [S30];
  - OpenAPI access through the anon key was removed [S31];
  - anon and service_role keys are deprecated "by the end of 2026" in favor of publishable and secret keys [S44];
  - asymmetric JWT signing keys [S49].
- Plan gates [S16]: Free plan pausing after 1 week of inactivity; phone MFA
  ($75/month); branching, PITR, custom domains, SAML SSO, image
  transformations and leaked-password protection are paid; session controls
  need Pro or above.
- Self-hosted differs from Cloud [S33] [S45]: no branching, no managed
  backups/PITR, no analytics or vector buckets, a single project, and no
  Management API. Its Docker images "may lag behind".
- Passkeys and the OAuth server are beta or experimental.

**Firebase**

- Product names move. Data Connect was renamed SQL Connect on 2026-04-22, but
  the CLI still says `dataconnect`. Firebase Extensions shut down on
  2027-03-31. Dynamic Links shut down on 2025-08-25.
- The Blaze (paid) plan is required for:
  - Cloud Functions deploys;
  - Cloud Storage, even default buckets, since 2026-02-03 [F12];
  - SQL Connect after its trial [F52].
- Identity Platform is required for MFA, SAML/OIDC, blocking functions and
  multi-tenancy [F14] [F18].
- The Firestore Standard and Enterprise editions differ: joins through
  Pipelines and text search exist only on Enterprise [F6] [F53]. Say which
  edition a cell describes.

**PocketBase** (from `pocketbase-appwrite.md`)

- Pre-1.0, with breaking releases. v0.23 rewrote the APIs (admins became
  `_superusers`, hooks were redesigned, MFA/OTP/batch were added), so
  tutorials from before 0.23 are wrong. v0.40 moved to `encoding/json/v2` and
  "is not fully backward compatible".
- The JS hooks run in goja (CommonJS, no Node APIs).
- There is a single maintainer, and the FAQ notes that donations have stopped.

**Appwrite** (from `pocketbase-appwrite.md`)

- 1.8.0 introduced TablesDB (tables, rows, columns) and deprecated the
  collections/documents API. In 2.0, "collections/documents" is correct again
  for DocumentsDB and VectorsDB. Name the database type in every cell.
- 2.0 made PostgreSQL the default on new self-hosted installs (1.9.5 had
  disabled it). Each 2.x minor release carries breaking notes (2.3 removed dev
  keys; 2.4 refuses outbound requests to private addresses).
- Cloud plan gates [A39] [A40]: transaction operation caps, custom SMTP
  templates on Pro and above, 60-minute minimum schedule intervals on Free,
  Free caps (1 database, 5 functions, 3 buckets).
- Self-hosted VectorsDB and DocumentsDB need extra engines or flags. Not every
  function runtime is available on Cloud [A41].

**Prisma**

- Prisma 8 is the biggest risk. npm `prisma@latest` is already 8.0.0-rc.23,
  and the unversioned docs describe Prisma 8. Prisma 7 pages live under
  `/docs/orm/v7/`.
- Prisma 8 changes:
  - `contract.prisma` and `prisma contract emit` replace `schema.prisma` and `generate`;
  - the query shape becomes `db.orm…`;
  - `db.transaction` has no isolation-level or timeout option;
  - middleware replaces `$extends`;
  - most nested writes are postponed;
  - early-stage database support (MongoDB early access, SQLite experimental, no MySQL yet).
- GA is "expected in October 2026", after which v7 gets 18 months of fixes
  [PR17]. Re-check Prisma cells as soon as 8.0.0 ships.
- The docs contradict themselves. The Prisma 7 supported-databases page
  (fetched 2026-10-17) still lists MongoDB 4.2+ [PR14], while the v7 upgrade
  guide and driver-adapter pages say MongoDB stays on 6.x [PR10] [PR13].
- Prisma's cloud products are changing:
  - Accelerate retires on 2026-12-01;
  - Optimize was sunset on 2026-03-23;
  - Pulse is deprecated;
  - the Prisma Postgres Early Access tier is deleted on 2026-11-01.

  Do not cite any of these as Prisma capabilities.

**UltimaBase**

- The column reflects pre-release `main` `6f37748e`. Several "planned" cells
  depend on ROADMAP entries that state "Planned is not shipped" and have no
  dates. Do not imply timelines.
- The REST plugin is marked experimental. The vector plugin declares a field
  only.
