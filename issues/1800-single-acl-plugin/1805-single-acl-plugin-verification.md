# 1805: Verify the single-plugin ACL vertical

- Status: planned
- Milestone: 18
- Packages: repository-wide
- Depends on: 1804
- ADR: all accepted milestone 18 and ACL decisions

## Goal

Prove through public source and built boundaries that portable plugin
containment works generically and PostgreSQL ACL enforcement requires exactly
one ACL plugin.

## Acceptance criteria

- [ ] A fresh dependency audit finds no ACL vocabulary in Core or PostgreSQL and no remaining `acl-postgres-plugin` workspace or active installation instruction.
- [ ] One community JSON-backed plugin field proves exact authoring inference, immutable containment, generic PostgreSQL compilation, GIN compatibility, and application isolation.
- [ ] ACL public, authenticated, principal, role, relation, mutation, cleanup, event, Master, rollback, and multi-application paths remain fail-closed.
- [ ] ACL installs with PostgreSQL as `aclPlugin()` plus `postgresPlugin()` in either valid configuration order and remains adapter-neutral without PostgreSQL.
- [ ] Public declarations, Typegen, JavaScript, Typegen-free applications, package archives, and official manifest inventories contain no removed bridge surface.
- [ ] Active documentation and backlog metadata describe one ACL plugin and distinguish portable containment operands from complete logical values.
- [ ] The milestone README records exact commands, coverage or focused security evidence, and deliberately deferred ACL hardening work.

## Tests

- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [ ] Source and packed language-service, package archive, public E2E, conformance, and PostgreSQL Testcontainers gates pass.
- [ ] Issue and documentation metadata checks pass after removing every active bridge reference.

## Out of scope

- Completing issues 432 through 435.
- Adding another adapter implementation.
- Broadening containment into a general plugin Query language.
