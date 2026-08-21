# Milestone 16 — Kernel security and release hardening

- Status: completed

Close the release-readiness gaps discovered after milestones 14 and 15. This
milestone does not reopen the accepted open-kernel or optional-product package
architecture. It first makes the Master trust boundary explicit, then aligns
the observable privilege contract, security verification, public documentation,
and authoring surface with the architecture already delivered.

No issue may solve the Master provenance finding implicitly. Issue 1601 owns
that architectural decision and issue 1602 implements only the accepted result.
The milestone creates no second Hooks or Access contracts package and adds no
new concrete product capability to Core.

## Execution order

### Security and policy truth

1. [x] [1601 — Decide Master context provenance and plugin trust](1601-master-context-provenance-adr.md)
2. [x] [1602 — Enforce application-owned Master provenance](1602-master-context-provenance-enforcement.md)
3. [x] [1603 — Align enforceable privileges and environmental claims](1603-privilege-and-environment-truth.md)

### Public contracts and verification

4. [x] [1604 — Audit and trim optional-product public surfaces](1604-optional-product-public-surface-audit.md)
5. [x] [1605 — Add evidence-backed plugin authoring helpers](1605-evidence-backed-plugin-authoring-dx.md)
6. [x] [1606 — Harden Access and Hooks security coverage](1606-optional-product-security-coverage.md)
7. [x] [1607 — Strengthen official capability conformance](1607-official-capability-behavior-conformance.md)

### Diagnostics, cost, maintenance, and documentation

8. [x] [1608 — Make public-transport protection diagnostics precise](1608-public-transport-protection-diagnostics.md)
9. [x] [1609 — Measure the no-Hooks and no-Access Runtime cost](1609-no-product-runtime-cost.md)
10. [x] [1610 — Split oversized kernel and optional-product modules](1610-kernel-module-maintainability.md)
11. [x] [1611 — Reconcile active plugin documentation and executable examples](1611-plugin-documentation-reconciliation.md)
12. [x] [1612 — Normalize backlog status and milestone metadata](1612-backlog-metadata-normalization.md)
13. [x] [1613 — Run the milestone 16 release-readiness gate](1613-release-readiness-verification.md)

Issues without a real dependency may progress independently, but the final gate
depends on every issue above. Documentation reconciliation intentionally follows
the public-surface and diagnostic decisions so examples describe the final
contract once.

## Release-readiness evidence

The final audit started from clean commit `f0e77cd`. Core's production manifest
contains only `@ultimabase/shared`, `semver`, and `uuid`; dependency constraints
and source scans found no concrete Hooks, Access, ACL, Roles, database,
transport, `plugin-kit`, or cross-package deep import. Source and built public
tests retain Master provenance, exact callback ownership, every enforceable
privilege boundary, official environment claims, optional-product conformance,
ACL independence, alternative engines, explicit instances, lifecycle cleanup,
application isolation, JavaScript and Typegen-free execution, and PostgreSQL
behavior.

The structural no-product budget measures one canonical Runtime assembly and
zero optional behavior or enforcement bundles, stages, and request calls. The
control fixture adds one neutral behavior stage and observes two calls, proving
the budget detects placeholder work. Hooks and Access together leave the same
database budget as no product: one read, one prepared mutation, one executed
mutation, one transaction, and one commit.

Coverage passed across 393 files and 2,024 tests. Global coverage is 88.75%
statements, 81.47% branches, 93.80% functions, and 88.89% lines. Access is
83.58%, 71.69%, 88.95%, and 83.14%; Hooks is 90.05%, 81.38%, 94.89%, and
90.41%, respectively. All global and product-specific floors remain satisfied.

The exact final commands were `yarn constraints`, `yarn typecheck`, `yarn test`
(349 files, 1,887 tests), `yarn test:coverage`, `yarn test:performance` (2
tests), `yarn build`, `yarn test:pack:built` (17 files, 85 tests),
`yarn test:e2e:built` (45 files, 182 tests), `yarn lint`, and
`yarn format:check`. Active documentation plus backlog metadata added 14 focused
checks. PostgreSQL Testcontainers ran through Docker 29.7.2. Build validation
included clean `attw` and `publint` results; lint reported zero errors and 76
existing centralized file-size warnings.

No new defect or blocking architectural inconsistency was found. Paused ACL
issue 432 and generated-schema DX issue 810 remain deliberately outside this
milestone, as does declaration of the first usable release before transport
milestones are implemented. These are non-blocking roadmap items, not waived
release-readiness failures for the milestone 14 kernel or milestone 15 optional
products.
