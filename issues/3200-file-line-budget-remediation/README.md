# Milestone 32 — Remove file-line budget exceptions

- Status: in-progress
- Authorization: user request of 2026-09-22

The target is zero handwritten TypeScript baseline exceptions. Production
files fail above 600 lines, tests above 700; warnings remain at 400/600.
Generated artifacts remain excluded. This is a structural maintenance pass,
not permission to change the public contract or drop tests.

## Execution order

- [x] [3201 — Split oversized Core query and schema modules](3201-core-query-schema.md)
- [x] [3202 — Split oversized Core Runtime modules](3202-core-runtime.md)
- [x] [3203 — Split oversized ACL and PostgreSQL modules](3203-acl-postgres.md)
- [ ] [3204 — Split oversized unit and language-service tests](3204-unit-tests.md)
- [ ] [3205 — Split oversized PostgreSQL and packed E2E tests](3205-e2e-tests.md)
- [ ] [3206 — Remove baseline machinery and audit the final budget](3206-remove-baseline.md)

Each issue follows implementation, relevant tests, audit, correction and
re-audit until no finding remains, then one local commit. Record exact
added/deleted lines and a Documentation impact classification in its handoff.
Do not push. If a responsible split cannot preserve behavior, test isolation,
or coverage, stop and explain before changing the architecture.
