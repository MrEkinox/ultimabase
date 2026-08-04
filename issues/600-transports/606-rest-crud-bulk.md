# 606: Execute REST CRUD, bulk, and upsert routes

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/rest-plugin`
- Depends on: 315, 316, 603, 604, 605
- ADR: ADR-0004

## Goal

Convert REST inputs into Operation AST and execute them through RequestEngine.

## Acceptance criteria

- [ ] Every generated route uses Runtime terminals.
- [ ] ACL create-input policy and native field Access shape inputs.
- [ ] Dates serialize as ISO strings.
- [ ] Bulk response contracts match Runtime.

## Tests

- [ ] Transport contract suite for every operation.
