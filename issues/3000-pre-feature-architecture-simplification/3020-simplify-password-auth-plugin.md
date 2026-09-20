# 3020: Simplify the Password Auth plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/password-auth-plugin`
- Depends on: 3019
- ADR: retained authentication and operation decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify Password Auth around the canonical operation graph while preserving
its developer API, private credentials, sessions, and transport behavior.

## Acceptance criteria

- [ ] Baseline User schema specialization, signup, login, refresh, logout,
      session resolution, private storage, codecs, exports, and tests.
- [ ] Remove duplicate operation metadata, input derivation, binding, session,
      result, and transport projection work made obsolete by the canonical graph.
- [ ] Preserve `AppUser` convenience methods, schema-derived signup fields,
      username/password-only login, canonical usernames, Argon2id verifiers,
      opaque revocable sessions, readable User results, safe errors, and
      owner-private credentials.
- [ ] Preserve direct TypeScript, JavaScript, REST, GraphQL, HTTP session, Access,
      Hooks, rollback, cancellation, and Master behavior.
- [ ] Change no public behavior, configuration, export, route, field, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected Password Authentication pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [ ] Source and packed editor, JavaScript, cryptography, sessions, private
      storage, REST, GraphQL, policy, safe-error, rollback, cancellation, and
      PostgreSQL suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for credential disclosure, changed inputs, session forgery,
      duplicate operation paths, user-schema coupling, and needless adapters.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding providers, OAuth, email workflows, MFA, or account recovery.
