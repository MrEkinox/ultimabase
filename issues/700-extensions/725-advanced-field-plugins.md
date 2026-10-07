# 725: Add advanced field plugins

- Status: planned
- Milestone: 7+
- Packages: future field plugin packages ending with `-plugin`
- Depends on: 103, 617
- ADR: separate ADRs as needed

## Goal

Plan independent money, encrypted, hashed, geo, vector, and other advanced
stored-field plugins.

## Acceptance criteria

- [ ] Each field kind receives its own focused follow-up issue before implementation.
- [ ] Secrets and precision behavior are explicit.

## Follow-up issues

- [728: Add the pg-vector field plugin contract](728-pg-vector-field-plugin.md)

Validation-only formats do not require field-plugin follow-ups. Issue 2007
replaces the former derived-field plan with native fields composed with
developer-selected Standard Schema validators and explicit input Hooks when
normalization is required.

Core-owned output-only virtual fields moved to
[milestone 25](../2500-contextual-fields-virtual-results/README.md). They are
not a concrete field plugin because they change canonical schema result,
selection, Runtime, Typegen, and transport behavior while deliberately owning
no storage contract.
