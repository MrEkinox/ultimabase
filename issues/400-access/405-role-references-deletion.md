# 405: Resolve role references and deletion policies

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 402, 404
- ADR: ADR-0006

## Goal

Resolve schema-qualified UUID or normalized-name references and apply explicit
`fail`, `preserve`, and `cascade` deletion semantics through ordinary persisted
model deletion without importing an ACL implementation.

## Target developer experience

```ts
const EditorReference = AppRole.role('editor')

const Editor = await AppRole.query()
	.equalTo('name', 'editor')
	.first({ useMasterKey: true })

await Editor?.delete({ useMasterKey: true })
```

## Acceptance criteria

- [x] `AppRole.role(name)` and its explicit UUID-reference form retain exact RoleSchema identity and cannot be mixed with references from another role domain.
- [x] Name references resolve to stored UUIDs before membership evaluation; persisted instances and UUID references avoid repeated name lookup.
- [x] Unknown or ambiguous names fail.
- [x] Rename preserves UUID identity and invalidates no existing UUID reference.
- [x] One RoleSchema declaration owns its default external-reference deletion policy; ordinary model `delete()` requires no roles-plugin execution option language.
- [x] `fail` rejects deletion while role-owned membership edges or registered external references remain.
- [x] `preserve` removes the role while external references remain inert because neutral role resolution returns no membership.
- [x] `cascade` removes role-owned edges and invokes only generic, explicitly registered reference-cleanup contributions.
- [x] The roles package never imports ACL, authentication, or another reference consumer.
- [x] Every deletion policy is transactional; cascade is master-only and audited.
- [x] Direct Query deletion executes the same configured policy and cannot bypass reference cleanup or auditing.

## Tests

- [x] Schema-qualified UUID/name lookup, rename, unknown reference, each deletion policy, direct Query deletion, external cleanup contribution, rollback, and audit tests.

## Implementation note

Package-level tests cover reference identity, strict lookup selection, policy
validation, cleanup contribution nominal typing, bulk-bypass rejection, and
hook registration. The Docker-backed transaction, rollback, rename, direct
Query, cleanup, and event proof is intentionally centralized in issue 423 so
the same scenario validates the public PostgreSQL vertical once.
