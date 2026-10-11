# ADR-0317: Access rules, explicit openings and plugin permissions

- Status: proposed
- Date: 2026-10-11
- Supersedes, once accepted: ADR-0293 where `allow` and `where` are separate rule steps and an
  omitted result is possible; the `default` option of `accessPlugin`
- Refines: ADR-0116 (Access), ADR-0102 (policy contributions), ADR-0294 (`publicWrites`),
  ADR-0304 (principal and predicates), ADR-0312 (environment defaults), ADR-0313 (diagnostics),
  ADR-0316 (rules in `.with`); applies ADR-0288
- Approval: decisions of the Access review (`docs/handoff/revue-plugins/access.md`, decisions 1
  to 3 and 5 to 10, validated by the user on 2026-10-09) and of the Soft Delete review
  (`soft-delete.md`, decisions 5 and 6); record to be accepted by the user
- Already implemented elsewhere: principal (ADR-0304), `can()` and `PublicError` (ADR-0305),
  readable results (ADR-0306), checked links (ADR-0308), `isAuthenticated` (ADR-0304)

## Context

Access follows KeystoneJS: an operation step before loading, a row filter inside the query, and a
per-object `item` check on the locked original and the candidate. Today an operation rule has
separate `allow` and `where` steps and may return nothing (the ADR-0293 trap), the plugin option
`default` opens operations without naming them in logs, field rules require every member, four
helpers duplicate `true`/`false`, and a denial gives no server-side hint. Soft Delete needs a
`readDeleted` permission that Access can grant without either package importing the other.

## Decision

1. **One operation rule.** For each operation, a rule is a function (or a value) that returns
   `true` (every row), `false` (no row) or a filter; it runs before loading. Its type forbids
   returning nothing. Mutations also accept the detailed form `{ where, item }`, where `where`
   is that same rule and `item({ originalItem, item, principal, … })` returns a boolean:

   ```ts
   .with({ access: {
     read: ({ where }) => where.eq('published', true),
     update: {
       where: ({ principal }) => principal !== undefined,
       item: ({ originalItem, item, principal }) =>
         originalItem.author?.id === principal?.id && item.author?.id === originalItem.author?.id,
     },
     delete: hasRole(Admin),
   } })
   ```

   `read` covers `one`, `many`, `count` and `exists`, or takes `{ one, many, count, exists }`
   with each member optional. Plugin commands keep their own key (`softDeleteOne`,
   `restoreMany`…) with the same forms, and their `input` is available to the rule.

2. **`allowWithoutRule` replaces `default`.** Without a schema rule, an operation is denied
   unless `accessPlugin({ allowWithoutRule })` opens it:

   ```ts
   accessPlugin({ allowWithoutRule: { all: true, write: false } })
   accessPlugin({
   	allowWithoutRule: { read: true, count: false, write: isAuthenticated },
   })
   accessPlugin({ allowWithoutRule: { all: 'development' } })
   ```

   - Keys: `all`; the groups `read` (`one`, `many`, `count`, `exists`) and `write` (`create`,
     `update`, `upsert`, `delete` and request plugin commands); each operation or plugin command
     key alone. An operation key wins over its group, a group over `all`; a schema rule always
     wins.
   - Values: `true` (open, production included), `'development'` (open outside production;
     in production `start()` fails with a message naming the opened operations, ADR-0312), a
     context predicate (`PolicyPredicate`, no filter: the fallback applies to every schema), or
     `false`/absent (denied).
   - After `start()`, Access logs one `warn` line per opening, production included, with
     predicate names (ADR-0313). A `write` opening is an explicit policy for ADR-0294:
     transports do not also require `publicWrites: true`.

3. **Partial field rules.** `output`, `where`, `orderBy`, `fill`, `replace` and `clear` are
   optional; an omitted member restricts nothing.
4. **Helpers.** `anyOf`, `allOf` and `not` stay; `allowAll`, `denyAll`, `allOperations` and
   `allMutations` are removed.
5. **Denial diagnostics.** Outside production, a denial logs at `info` the schema, operation,
   step (operation, row filter, `item`, field) and rule location; in production the same line
   is `debug`. Clients see nothing new.
6. **Startup summary.** After `start()`, one `info` line lists the schemas exposed without any
   Access rule (therefore fully denied unless opened).
7. **Plugin permissions.** Core lets a plugin declare a named schema permission (for example
   Soft Delete's `readDeleted`) and ask, during a request, whether the current caller holds it
   for a schema. Core asks the installed policies; a permission is held only when a policy
   grants it (fail-closed, Master always holds it). Access grants it through a rule of the same
   name, `true`/`false` or a predicate (`.with({ access: { readDeleted: hasRole(Admin) } })`),
   or through its own key in `allowWithoutRule`; `all`, `read` and `write` never include plugin
   permissions. Soft Delete uses it: with `readDeleted`, normal reads see deleted rows (filter
   and sort on `isDeleted`, `deletedAt`); without it, the protected filter applies. Neither
   package imports the other.

## Consequences

- The old-form `access` option of `define` follows the same rule types until migration 6.8
  removes the old form; examples, create-app templates and documentation move to the new forms.
- Tests: each rule form and its type errors (nothing returned), detailed mutations with `item`,
  read granularity, every `allowWithoutRule` key and value with precedence, `'development'`
  refused in production, predicates, warn lines, `publicWrites` interplay, partial field rules,
  removed helpers, denial diagnostics per environment, startup summary, plugin permissions with
  and without Access and with Master, Soft Delete `readDeleted` through REST and GraphQL; DX
  audit and form D bench.
- Documentation impact: both (Access, Soft Delete and security pages; Access and Soft Delete
  READMEs).

## Out of scope

Multi-tenant isolation (a later plugin), an `owner` shortcut (rejected by the review), field
answers from `can()`, ACL's own options (6.3).
