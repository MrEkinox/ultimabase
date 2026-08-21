# 725: Add advanced field plugins

- Status: planned
- Milestone: 7+
- Packages: future field plugin packages ending with `-plugin`
- Depends on: 103, 617
- ADR: separate ADRs as needed

## Goal

Plan independent money, encrypted, hashed, geo, vector, virtual, and computed field plugins.

## Acceptance criteria

- [ ] Each field kind receives its own focused follow-up issue before implementation.
- [ ] Secrets and precision behavior are explicit.

## Follow-up issues

- [728: Add the pg-vector field plugin contract](728-pg-vector-field-plugin.md)

Validation-only formats do not require field-plugin follow-ups. Issue 2007
replaces the former derived-field plan with native fields composed with
developer-selected Standard Schema validators and explicit input Hooks when
normalization is required.
