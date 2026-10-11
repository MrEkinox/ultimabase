# ADR-0320: PostgreSQL safe synchronization, connection settings and debugging

- Status: proposed
- Date: 2026-10-11
- Refines: ADR-0292 (schema policies), ADR-0299 to ADR-0303 (adapter contracts), ADR-0312
  (`DATABASE_URL`, environment defaults), ADR-0313 (logger), ADR-0316 (rules in `.with`);
  applies ADR-0288
- Approval: decisions of the PostgreSQL review (`docs/handoff/revue-plugins/postgres.md`,
  decisions 1 to 13, validated by the user on 2026-10-09, as corrected by the adapter audit
  `adaptateurs.md`); record to be accepted by the user
- Already implemented elsewhere: partial indexes and `ultimabase.health()` (ADR-0303), neutral
  errors and retries (ADR-0299, ADR-0300, ADR-0302), `DATABASE_URL` at start (ADR-0312)

## Context

The `override` policy synchronizes tables but silently converts incompatible column types
(`float` to `string`), never reports what it changed outside errors, and starts even when a
forgotten rename leaves a `NOT NULL` column without default that blocks every insert. URL mode
cannot tune the pool, startup gives up on the first connection failure (Docker, Kubernetes),
queries cannot be logged, and the table option is a template-based schema option.

## Decision

1. **Forgotten renames.** Under `override`, `start()` fails when a managed table has an
   unmanaged `NOT NULL` column without default, and suggests `renamedFrom` when a field
   disappears while another of the same type appears.
2. **Safe conversions only.** Under `override`, only widening conversions apply automatically;
   any other type change is refused with a message pointing to a migration.
3. **Change log.** Under `override`, each applied change is logged at `info`, one line each
   (ADR-0313).
4. **Connection settings in URL mode.** `postgresPlugin({ connection: { max, ssl,
statementTimeoutMs, idleTimeoutMs, connectRetries } })`; `connectRetries` (default 0, an
   explicit option) retries the first connection with growing delays.
5. **Column names in `snake_case`** by default (`created_at`), like table names.
6. **Debugging.** `postgresPlugin({ debug: { logQueries, slowQueryMs } })` logs statements and
   durations through the plugin logger, never values; `slowQueryMs` may be used in production.
7. **Table rule in `.with`.** The schema option `postgres: { table }` becomes a `.with` rule
   (`.with({ postgres: { table } })`, ADR-0316), removing PostgreSQL's use of the projection
   templates.
8. **Kept.** `url` or `pool`, the three policies, no destructive drop, no raw SQL or Drizzle
   type exposed, `renamedFrom` until a migrations plugin. Documentation: no manual SQL through
   UltimaBase (it would bypass Access, ACL, Soft Delete and hooks); reports use their own pool
   outside UltimaBase; a dedicated PostgreSQL schema through `search_path` in the URL.

## Consequences

- Existing databases built with camelCase columns are not migrated automatically: under
  `override` the new names are new columns, so the change log and the forgotten-rename check
  must make the switch visible; nothing is published yet.
- Tests: rename detection and suggestion, refused and widening conversions, change log lines,
  connection settings and retries (Testcontainers), snake_case columns, query and slow-query
  logs without values, `.with({ postgres })`; DX audit and form D bench (expected gain from
  leaving the templates).
- Documentation impact: both (PostgreSQL page and README, deployment notes).

## Out of scope

Read replicas, a migrations plugin, the neutral `vector` plugin and the MongoDB adapter.
