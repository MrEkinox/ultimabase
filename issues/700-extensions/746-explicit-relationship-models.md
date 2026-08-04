# 746: Document explicit relationship models

- Status: done
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 740, 744
- ADR: ADR-0118

## Goal

Prove and document the recommended ordinary-schema pattern for relationships
whose edge owns application data.

## Acceptance criteria

- [x] Core examples model an edge such as membership or ordered content with one ordinary schema and two pointer fields.
- [x] The example demonstrates edge fields, unique composite indexes, Query filters, hooks, Access, and transactional writes without direct join-table APIs.
- [x] Documentation distinguishes implicit owning relation storage from explicit relationship objects and explains when to choose each.
- [x] Type tests prove exact source, target, edge input, selection, and model inference through public exports.
- [x] PostgreSQL coverage proves composite uniqueness, referential behavior, querying from either side, and rollback.
- [x] Schema and PostgreSQL READMEs include concise developer-facing examples and no transport-specific syntax.

## Out of scope

- Special hidden metadata options on `relationField`, ordering protocols, REST, and GraphQL.
