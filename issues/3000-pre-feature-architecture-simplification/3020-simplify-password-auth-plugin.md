# 3020: Simplify the Password Auth plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/password-auth-plugin`
- Depends on: 3019
- ADR: retained authentication and operation decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify Password Auth around the canonical operation graph while preserving
its developer API, private credentials, sessions, and transport behavior.

## Acceptance criteria

- [x] Baseline User schema specialization, signup, login, refresh, logout,
      session resolution, private storage, codecs, exports, and tests.
- [x] Remove duplicate operation metadata, input derivation, binding, session,
      result, and transport projection work made obsolete by the canonical graph.
- [x] Preserve `AppUser` convenience methods, schema-derived signup fields,
      username/password-only login, canonical usernames, Argon2id verifiers,
      opaque revocable sessions, readable User results, safe errors, and
      owner-private credentials.
- [x] Preserve direct TypeScript, JavaScript, REST, GraphQL, HTTP session, Access,
      Hooks, rollback, cancellation, and Master behavior.
- [x] Change no public behavior, configuration, export, route, field, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected Password Authentication pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [x] Source and packed editor, JavaScript, cryptography, sessions, private
      storage, REST, GraphQL, policy, safe-error, rollback, cancellation, and
      PostgreSQL suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for credential disclosure, changed inputs, session forgery,
      duplicate operation paths, user-schema coupling, and needless adapters.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding providers, OAuth, email workflows, MFA, or account recovery.

## Implementation and preservation audit

The username invariant now reads the normalized mutation schema through Core's
existing `getOperationSchema`, removing its duplicate eight-kind dispatch and
unchecked casts. Core validates exact schema ownership before final guards;
public collection mutations remain itemized and atomic. The same canonical
username check still runs on create/upsert inputs.

The hasher keeps the actual operation path: normalize credentials once in the
handler, hash or verify through Argon2id, and wipe temporary buffers in `finally`.
Three private raw-input wrappers and their byte-conversion relay had only test
consumers. Those tests now exercise the product's normalized path, retaining
all assertions about salts, PHC protocol, incorrect credentials, policy upgrades,
non-downgrade, parameter-version mismatches and dummy rejection. Integration
fixtures explicitly normalize their raw inputs first. The private credential
record interface is reused by comparison and upgrade helpers; their four-field
comparison and storage compare-and-swap are unchanged.

The final source metric is 21 files / 3,234 lines, down from 21 / 3,329 at
`129132a8` (-95). The 32 public exports and 15,967 declaration bytes are identical.
Four canonical operations, four class methods, seven privileges, native hashing,
private collection descriptors, transport codecs/routes and configuration are
unchanged. Session issuance/rotation/revocation, fresh anonymous readable-profile
checks, required-profile rollback, owner attribution, cancellation and audited
Master elevation retain their existing paths. Cookie payloads intentionally
retain their separate accepted contract. No substitute API or new feature is
introduced. B-001–B-012 and P-001/P-005/P-006/P-008–P-012/P-017/P-019–P-023 are
reconciled to the same behavior.

Documentation impact: internal engineering documentation.
The package README and owned Password Authentication website page were reviewed:
class methods, flat signup fields, login credentials, transport payloads,
canonicalization, Argon2id policy, sessions and errors remain accurate. No public
prose change is needed for these private reductions.

Audit correction: the new batch regression originally reused a worker schema
containing the default User from the previous test. Its custom required field
made startup fail. It now owns a separate PostgreSQL fixture and disposes it
with the application. The focused built regression passes all three tests.
This was a fixture defect, with no production or migration-contract change.

Final validation and audit:

- The 63 package unit/type tests, root typecheck, final package test typecheck,
  build, ESLint and dependency constraints pass. Built declarations are
  byte-identical; no export or configuration change occurs.
- After the fixture correction, all 318 package/boundary/source-integration
  tests pass across 90 files (113.52 s). Coverage includes the whole Password
  Auth package with repository exclusions and thresholds unchanged. Comparing
  its 21 maps with the full 3018 baseline loses no retained covered location;
  49 edited/deleted records were reviewed. The retained upsert guard gains
  coverage. The removed crypto-wrapper scenarios execute the actual hasher.
- All 106 built integration/archive checks pass across 11 files (20.56 s),
  including editor contracts, User methods, sessions, profiles, REST, GraphQL,
  native hashing publication and public protection. The new regression covers
  rollback after a non-canonical second creation and successful/rejected upserts.
- The final complete diff audit is green, with no unresolved finding, new
  public surface, security weakening or work outside the issue criteria.
