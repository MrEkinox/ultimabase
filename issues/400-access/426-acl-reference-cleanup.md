# 426: Integrate ACL subject-reference cleanup

- Status: done
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/core`
- Depends on: 405, 409, 509, 510
- ADR: ADR-0117, ADR-0119, ADR-0122, ADR-0126

## Goal

Let subject-owning providers inspect or remove persisted ACL references through
Core's neutral cleanup contract without ACL importing authentication or roles.

## Acceptance criteria

- [x] ACL registers reference inspection and cleanup contributions for its principal and role subject kinds.
- [x] Inspection and cleanup cover every ACL-enabled schema and remain isolated to the current application.
- [x] The subject-owning schema or provider remains the sole owner of `fail`, `preserve`, and `cascade` deletion policy.
- [x] `fail` can detect ACL references, `preserve` leaves inert entries untouched, and `cascade` removes only matching ACL entries.
- [x] Removing one subject preserves all unrelated public, authenticated, principal, role, and right entries.
- [x] Role cleanup consumes only schema-qualified neutral references and never imports or identifies `rolesPlugin`.
- [x] Principal cleanup accepts exact schema-qualified identities without assuming a User schema or auth provider.
- [x] JSONB cleanup rewrites only matching ACL documents and uses the generated GIN index to discover affected rows without a separate ACL table.
- [x] Cleanup uses the subject deletion transaction and emits no committed state or event after rollback.
- [x] Set-based subject deletion cannot bypass item-specific reference policy.

## Tests

- [x] Principal and role fail, preserve, cascade, rollback, unrelated-entry, multiple-schema, compatible-provider, and application-isolation tests.
