# 1907: Verify the extension-free public vertical

- Status: planned
- Milestone: 19
- Packages: repository-wide
- Depends on: 1906
- ADR: all accepted milestone 19 decisions

## Goal

Prove from source, built packages, JavaScript applications, generated types, and
PostgreSQL execution that direct plugin configuration fully replaces schema and
field extensions.

## Acceptance criteria

- [ ] A fresh production-source audit finds no schema-extension or field-extension vocabulary, implementation, public export, handler, selector, or compiler representation.
- [ ] ACL, PostgreSQL table naming, PostgreSQL column rename intent, Roles, Access, and Hooks operate through their canonical direct contracts.
- [ ] One community plugin proves direct schema and field options, one plugin field, one structural contribution, and application isolation without a generic metadata bag.
- [ ] Options are absent from autocomplete without their installed plugin contract, exact with it, and rejected during static compilation when the owner is absent.
- [ ] Public declarations, Typegen, JavaScript, Typegen-free applications, package archives, official manifests, and deep-import guards contain no removed extension surface.
- [ ] Active architecture, concepts, package READMEs, examples, and backlog documentation use the extension-free vocabulary and preserve historical records as history.
- [ ] The milestone README records exact commands, focused security and migration evidence, and any deliberately deferred work.

## Tests

- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [ ] Source and packed language-service, public E2E, conformance, JavaScript, Typegen-free, archive, migration, ACL security, and PostgreSQL Testcontainers suites pass.
- [ ] Issue and documentation metadata checks pass after the final removal audit.

## Out of scope

- Query surface naming changes.
- Compatibility tests for removed schema or field extension APIs.
