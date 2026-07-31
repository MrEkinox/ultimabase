# 725: Add advanced field plugins

- Status: planned
- Milestone: 7+
- Packages: future field packages
- Depends on: 103, 617
- ADR: separate ADRs as needed

## Goal

Plan independent money, encrypted, hashed, geo, vector, virtual, and computed field plugins.

## Acceptance criteria

- [ ] Each field kind receives its own focused follow-up issue before implementation.
- [ ] Secrets and precision behavior are explicit.

## Follow-up issues

- [728: Add the pg-vector field plugin contract](728-pg-vector-field-plugin.md)
- [729: Define derived field contracts](729-derived-field-contracts.md)
- [730: Create the standard fields package](730-standard-fields-package.md)
- [731: Add email fields](731-email-field.md)
- [732: Add phone fields](732-phone-field.md)
- [733: Add web and network fields](733-web-network-fields.md)
- [734: Add portable identifier fields](734-portable-identifier-fields.md)
- [735: Add locale and timezone fields](735-locale-timezone-fields.md)
- [736: Add constrained numeric fields](736-constrained-numeric-fields.md)
