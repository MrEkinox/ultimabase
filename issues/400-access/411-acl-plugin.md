# 411: Implement aclPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 210, 410, 417, 418, 420
- ADR: ADR-0006, ADR-0090, ADR-0113, ADR-0116, ADR-0117

## Goal

Translate persisted object ACL values into native Access filters, item
decisions, and ACL-field restrictions. `aclPlugin` contributes policies to the
single Access lifecycle and never installs a parallel permission pipeline.

## Acceptance criteria

- [ ] The public factory is named `aclPlugin` and activates only schemas carrying its owned ACL extension.
- [ ] Reads, counts, updates, and deletes are filtered before execution, while inaccessible object existence remains hidden.
- [ ] ACL update requires `manageAcl`, and the ACL value is visible only when `manageAcl` allows it.
- [ ] ACL constraints remain separate from hook-transformable queries and cannot be removed by `beforeFind`.
- [ ] ACL registers schema-extension Access contributions plus opaque namespaced row constraints without exposing ACL nodes to Runtime or the developer Query.
- [ ] Create and ACL mutations use native item and field Access when they cannot be expressed entirely as row filters.
- [ ] ACL never makes a set-based terminal materialize rows implicitly; unsupported value-dependent bulk work requires an explicit itemized operation.
- [ ] Master bypass is decided inside `aclPlugin` from trusted request authority.
- [ ] ACL imports only neutral subject and role contracts and never imports or identifies `rolesPlugin` or an authentication plugin.
- [ ] A configured role subject requires the neutral role-resolution service; ACL without role subjects neither resolves nor requires it.
- [ ] Authenticated and principal subjects resolve through optional typed context providers and fail closed when their request identity is absent.
- [ ] Native schema and field Access continues to combine with ACL through logical `AND`; ACL can never broaden another denial.

## Tests

- [ ] Subject, operation, field, bulk, native-Access composition, role-free, missing-provider, compatible-provider, master, and application-isolation matrices.

## Out of scope

- Defining class-level or ordinary field permissions for schemas without ACL.
- Pointer and relation traversal, already proven to route through the same compiled Access plan by issue 747.
