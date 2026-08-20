# 1611: Reconcile active plugin documentation and executable examples

- Status: planned
- Milestone: 16
- Packages: repository-wide documentation and examples
- Depends on: 1603, 1604, 1605, 1608
- ADR: ADR-0189, ADR-0191, ADR-0202, ADR-0204, ADR-0205

## Goal

Make every active document and example describe the implemented optional Hooks,
optional Access, plugin privilege, claim, and authoring contracts.

## Acceptance criteria

- [ ] Core documentation no longer describes schema or field Hooks and Access as native product behavior.
- [ ] Every Hooks or Access schema example explicitly installs the owning plugin and fails type checking when the plugin is absent.
- [ ] PostgreSQL and pg-vector documentation configure Hooks before using hook options and use current lifecycle vocabulary.
- [ ] The open-plugin-authoring guide uses the actual provider handler inputs, registrar names, model surfaces, capability readers, privileges, and Typegen contracts.
- [ ] Architecture documentation distinguishes current workspaces from future package identities and matches the enforced dependency graph.
- [ ] Typegen filesystem and PostgreSQL network claims plus the final transport warning semantics are documented accurately.
- [ ] Historical ADRs, completed issues, and completed plans remain intact and are clearly excluded from active-contract assertions.
- [ ] Important README and concept-guide snippets are compiled or backed by executable examples from source and packed package exports.

## Tests

- [ ] Repository removal guards scan active documentation and examples for obsolete native product paths while excluding classified historical records.
- [ ] Language-service tests prove representative plugin-present autocomplete and plugin-absent failures.
- [ ] Documentation links and package import examples pass the repository documentation gate.

## Out of scope

- Rewriting accepted ADR history to hide superseded architecture.
- Documenting unimplemented future plugin features as current behavior.
- Changing Runtime behavior solely to preserve a stale example.
