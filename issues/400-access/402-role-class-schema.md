# 402: Implement Role class and internal schema

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 112, 204, 420, 747
- ADR: ADR-0005, ADR-0006, ADR-0116

## Goal

Define immutable `Role` references and reserved internal schemas built on the
completed relation contracts. Roles identify reusable subject membership; they
grant no operation or field permission by themselves.

## Target developer experience

```ts
const Editor = new Role({ name: 'editor' })
const Administrator = new Role({ name: 'administrator' })
```

Persistence remains explicit through the application-local role service rather
than methods on `Role`.

## Acceptance criteria

- [ ] A `Role` is an immutable nominal UUID-or-name reference with concise hover documentation and stable serialization.
- [ ] Stored names are non-empty and unique under one documented, locale-independent normalization strategy.
- [ ] Reserved role and membership schemas use public pointer and relation primitives rather than plugin-private relationship storage.
- [ ] Role persistence uses Query and RequestEngine through an application-local service, not Active Record methods on `Role`.
- [ ] Generated transport exposure is off by default.
- [ ] The schemas assume no Core User model, authentication plugin, or concrete principal kind.
- [ ] Core never imports `@ultimabase/roles` and schema metadata gains no native role vocabulary.

## Tests

- [ ] Runtime, type, language-service, public-export, normalization, and application-isolation tests cover references and internal schemas.
