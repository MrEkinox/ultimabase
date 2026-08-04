# 411: Implement aclPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 210, 410, 417, 418, 424, 425
- ADR: ADR-0006, ADR-0090, ADR-0113, ADR-0116, ADR-0117, ADR-0122

## Goal

Translate persisted object ACL values into native Access filters, item
decisions, and ACL-field restrictions. `aclPlugin` contributes policies to the
single Access lifecycle and never installs a parallel permission pipeline.

## Acceptance criteria

- [ ] The public factory is named `aclPlugin` and activates only schemas carrying its owned ACL extension.
- [ ] `aclPlugin()` works without options; its only behavioral options are adapter-neutral default entry limits owned by issue 428.
- [ ] Reads, counts, updates, and deletes are filtered before execution, while inaccessible object existence remains hidden.
- [ ] ACL update requires `manageAcl`, and the ACL value is visible only when `manageAcl` allows it.
- [ ] ACL constraints remain separate from hook-transformable queries and cannot be removed by `beforeFind`.
- [ ] ACL registers schema-extension Access contributions plus opaque namespaced row constraints without exposing ACL nodes to Runtime or the developer Query.
- [ ] Create and ACL mutations use native item and field Access when they cannot be expressed entirely as row filters.
- [ ] ACL never makes a set-based terminal materialize rows implicitly; unsupported value-dependent bulk work requires an explicit itemized operation.
- [ ] Master bypass is declared by the ACL Access contribution and decided only from trusted request authority; defaults, input resolution, validation, hooks, constraints, transactions, and events continue to execute.
- [ ] ACL imports only neutral subject and role contracts and never imports or identifies `rolesPlugin` or an authentication plugin.
- [ ] Package metadata has no dependency or peer dependency on a concrete authentication or roles package.
- [ ] Authenticated and exact-principal grants use the optional current-principal resolver once per operation and compare schema plus object ID.
- [ ] ACL without a principal resolver remains valid for public and master behavior; authenticated and exact-principal grants fail closed when identity is absent.
- [ ] Role grants use the neutral role resolver once per operation, accept multiple schema-qualified roles, and never inspect a provider plugin name.
- [ ] Missing role resolution cannot silently accept or evaluate a role-aware ACL value; role-free ACLs require no role provider.
- [ ] Multiple principals and roles union their matching rights without broadening unrelated rights.
- [ ] RoleSchema rows use the same ACL provider: read, update, membership and hierarchy mutations, delete, and manageAcl follow the ordinary RoleSchema Access lifecycle without recursive membership resolution.
- [ ] Native schema and field Access continues to combine with ACL through logical `AND`; ACL can never broaden another denial.

## Tests

- [ ] Subject, multiple-subject, operation, field, bulk, RoleSchema, recursion-safety, native-Access composition, public-only, role-free, missing-provider, compatible-provider, master, and application-isolation matrices.

## Out of scope

- Defining class-level or ordinary field permissions for schemas without ACL.
- Pointer and relation traversal, already proven to route through the same compiled Access plan by issue 747.
