# Milestone 16 — Kernel security and release hardening

- Status: planned

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
3. [ ] [1603 — Align enforceable privileges and environmental claims](1603-privilege-and-environment-truth.md)

### Public contracts and verification

4. [ ] [1604 — Audit and trim optional-product public surfaces](1604-optional-product-public-surface-audit.md)
5. [ ] [1605 — Add evidence-backed plugin authoring helpers](1605-evidence-backed-plugin-authoring-dx.md)
6. [ ] [1606 — Harden Access and Hooks security coverage](1606-optional-product-security-coverage.md)
7. [ ] [1607 — Strengthen official capability conformance](1607-official-capability-behavior-conformance.md)

### Diagnostics, cost, maintenance, and documentation

8. [ ] [1608 — Make public-transport protection diagnostics precise](1608-public-transport-protection-diagnostics.md)
9. [ ] [1609 — Measure the no-Hooks and no-Access Runtime cost](1609-no-product-runtime-cost.md)
10. [ ] [1610 — Split oversized kernel and optional-product modules](1610-kernel-module-maintainability.md)
11. [ ] [1611 — Reconcile active plugin documentation and executable examples](1611-plugin-documentation-reconciliation.md)
12. [ ] [1612 — Normalize backlog status and milestone metadata](1612-backlog-metadata-normalization.md)
13. [ ] [1613 — Run the milestone 16 release-readiness gate](1613-release-readiness-verification.md)

Issues without a real dependency may progress independently, but the final gate
depends on every issue above. Documentation reconciliation intentionally follows
the public-surface and diagnostic decisions so examples describe the final
contract once.
