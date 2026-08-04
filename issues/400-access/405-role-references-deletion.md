# 405: Resolve role references and deletion policies

- Status: planned
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

- [ ] `AppRole.role(name)` and its explicit UUID-reference form retain exact RoleSchema identity and cannot be mixed with references from another role domain.
- [ ] Name references resolve to stored UUIDs before membership evaluation; persisted instances and UUID references avoid repeated name lookup.
- [ ] Unknown or ambiguous names fail.
- [ ] Rename preserves UUID identity and invalidates no existing UUID reference.
- [ ] One RoleSchema declaration owns its default external-reference deletion policy; ordinary model `delete()` requires no roles-plugin execution option language.
- [ ] `fail` rejects deletion while role-owned membership edges or registered external references remain.
- [ ] `preserve` removes the role while external references remain inert because neutral role resolution returns no membership.
- [ ] `cascade` removes role-owned edges and invokes only generic, explicitly registered reference-cleanup contributions.
- [ ] The roles package never imports ACL, authentication, or another reference consumer.
- [ ] Every deletion policy is transactional; cascade is master-only and audited.
- [ ] Direct Query deletion executes the same configured policy and cannot bypass reference cleanup or auditing.

## Tests

- [ ] Schema-qualified UUID/name lookup, rename, unknown reference, each deletion policy, direct Query deletion, external cleanup contribution, rollback, and audit tests.
