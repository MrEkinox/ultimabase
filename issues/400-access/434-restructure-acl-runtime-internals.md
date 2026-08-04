# 434: Restructure ACL runtime internals

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`
- Depends on: 144, 351, 429, 430, 431, 432, 433
- ADR: ADR-0122, ADR-0125, ADR-0126, ADR-0127, ADR-0128

## Goal

Split the ACL implementation by domain responsibility after its behavior is
stable, without changing the concise public class, extension, or plugin API.

## Acceptance criteria

- [ ] ACL value, JSON, schema extension, subject resolution, input resolution, Access contributions, cleanup, and events live in focused modules.
- [ ] `plugin.ts` owns composition and registration rather than low-level mutation algorithms.
- [ ] Focused tests remain colocated with the source responsibility they verify.
- [ ] Shared invariants reuse small internal helpers without introducing abstractions for coincidental similarities.
- [ ] Strict record-boundary validation is reused where practical without adding a large runtime validation dependency.
- [ ] Public exports, hovers, serialized JSON, plugin names, constraint kinds, and runtime behavior remain unchanged.
- [ ] No deep import is introduced between packages.

## Tests

- [ ] Existing unit, type, IntelliSense, package-export, and PostgreSQL tests pass unchanged apart from moved imports.
- [ ] Packed declarations contain no private implementation types or `any`.
