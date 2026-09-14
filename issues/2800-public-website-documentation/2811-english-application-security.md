# 2811: Document application security

- Status: completed
- Milestone: 28
- Packages: `apps/website`, security-related official plugins
- Depends on: 2805, 2810
- ADR: none

## Goal

Give application developers an accurate security model before they expose a
public transport or handle trusted Master credentials.

## Acceptance criteria

- [x] The overview separates identity, authentication, authorization,
      validation, read shaping, and trusted server authority.
- [x] Password Auth explains public User identity, private credential and
      session storage, Bearer and cookie integration, and session limitations.
- [x] Access pages cover operation, row, item, field, and value-dependent
      enforcement with monotonic semantics and optional installation.
- [x] Roles are documented as optional request subjects that grant nothing by
      themselves.
- [x] ACL explains persisted per-object policy, protected constraints, subject
      references, and independence from the official Access package.
- [x] Master is documented as unforgeable server-side authority that bypasses
      authorization but retains structural validation, installed application
      validation, Hooks, transactions, constraints, and integrity work.
- [x] Threat-focused callouts reject client-derived Master flags, foreign app
      credentials, headers as authority, and presentation-only relation filters
      as security controls.

## Tests

- [x] Security snippets compile or execute through current public package
      exports and the minimal application where applicable.
- [x] Terminology checks reject Core `user` or `system` modes, implicit grants,
      transport bypasses, and incorrect Master claims.

## Out of scope

- Security certification, deployment hardening for a specific provider,
  unshipped authentication integrations, or private exploit documentation.
