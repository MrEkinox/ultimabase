# 411: Implement aclPlugin

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 210, 410, 417, 418, 424, 425
- ADR: ADR-0006, ADR-0090, ADR-0113, ADR-0116, ADR-0117, ADR-0122, ADR-0123

## Goal

Translate persisted object ACL values into native Access filters, item
decisions, and ACL-field restrictions. `aclPlugin` contributes policies to the
single Access lifecycle and never installs a parallel permission pipeline.

## Acceptance criteria

- [x] The public factory is named `aclPlugin` and activates only schemas carrying its owned ACL extension.
- [x] `aclPlugin()` works without options; its only behavioral options are adapter-neutral default entry limits owned by issue 428.
- [x] Reads, counts, updates, and deletes receive opaque row constraints before execution, while inaccessible object existence remains an adapter concern rather than post-filtering.
- [x] Only trusted master execution may read, filter, order by, explicitly create, or replace the ACL value; object `update` grants never authorize ACL management.
- [x] ACL constraints remain separate from hook-transformable queries and cannot be removed by `beforeFind`.
- [x] ACL registers schema-extension input hooks, field-kind Access, and opaque namespaced row constraints without exposing ACL nodes to Runtime or the developer Query.
- [x] Create input uses extension-targeted resolution while ACL selection and mutation use native field Access.
- [x] ACL never makes a set-based terminal materialize rows implicitly; ACL replacement requires `updateOne()`.
- [x] Master bypass is declared by the ACL field Access contribution and decided only from trusted request authority; defaults, input resolution, validation, hooks, transactions, and events continue to execute.
- [x] ACL imports only neutral subject and role contracts and never imports or identifies `rolesPlugin` or an authentication plugin.
- [x] Package metadata has no dependency or peer dependency on a concrete authentication or roles package.
- [x] Authenticated and exact-principal grants use the optional current-principal resolver once per operation and compare schema plus object ID.
- [x] ACL without a principal resolver remains valid for public and master behavior; authenticated and exact-principal grants fail closed when identity is absent.
- [x] Role grants use the neutral role resolver once per operation, accept multiple schema-qualified roles, and never inspect a provider plugin name.
- [x] Missing role resolution rejects accepted role-aware ACL values; role-free ACLs require no role provider.
- [x] Multiple principals and roles union their matching rights without broadening unrelated rights.
- [x] RoleSchema rows use the same schema-generic provider and role reference restoration never triggers recursive ACL authorization; only master may inspect or replace their ACL values.
- [x] Native schema and field Access continues to combine with ACL through logical `AND`; ACL can never broaden another denial.

## Tests

- [x] Focused subject, multiple-subject, operation mapping, field visibility, set-based replacement, role-reference restoration, public-only, role-free, missing-provider, compatible-provider, master, immutability, type, language-service, and package-export tests.
- [ ] PostgreSQL compilation, native-Access composition, RoleSchema persistence, and complete application-isolation matrices remain owned by issues 509, 415, and 427.

## Out of scope

- Defining class-level or ordinary field permissions for schemas without ACL.
- Pointer and relation traversal, already proven to route through the same compiled Access plan by issue 747.
