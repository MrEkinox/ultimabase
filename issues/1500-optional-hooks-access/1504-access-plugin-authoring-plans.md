# 1504: Extract the complete Access plugin

- Status: completed
- Milestone: 15
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1503
- ADR: ADR-0117, ADR-0128, ADR-0167 through ADR-0171, ADR-0189, ADR-0194, ADR-0204, ADR-0205

## Goal

Create the official Access plugin and move schema and field policy authoring plus
compiled plans and Runtime enforcement out of Core's native product surface as
one atomic extraction.

## Acceptance criteria

- [x] Create one complete `@ultimabase/access-plugin`; it owns its public contracts, importing it installs no behavior, and configuring its exported definition enables the official engine.
- [x] The plugin owns schema and field `access` option namespaces, decisions, combinators, filters, targets, defaults, provider contracts, and `AccessPlan` compilation.
- [x] Installing the plugin restores the accepted operation, filter, item, and field Access DX through public declarations and Typegen.
- [x] Omitting the plugin removes Access options and plan compilation without removing Core master authority.
- [x] Official-compatible Access providers import the plugin's public contracts and declare a non-ordering peer; independent alternative engines own their protocols and use only the generic public kernel.
- [x] The package uses only public Core and plugin-kit contracts and declares exact privileges.
- [x] Access plugin evaluates operation, filter, item, and field decisions through public Runtime capabilities with no private Core assembly branch.
- [x] Denials remain irreversible, row predicates and opaque constraints accumulate with logical `AND`, and field restrictions intersect before final output.
- [x] Initial evaluation, target preparation, value-dependent reevaluation, relationship recursion, and final restriction retain current order and fail-closed behavior.
- [x] Rewritten persistence plans carry the logical target's protected restrictions into the actual adapter statement.
- [x] Master remains a Core authority observed through the existing audited request context; the plugin explicitly declares bypass or enforcement behavior without creating Master.
- [x] No-Access applications allocate no plan, provider snapshot, placeholder handler, or Access-specific request state.
- [x] Core's existing Runtime constraint capability accepts generic protected policies that can only deny, append row filters and constraints, intersect fields, or return Core-validated structural output subsets.
- [x] Protected policies can inspect relation traversals, stable mutation targets, actual mutation outcomes, and final results without receiving accumulated enforcement state or replacement authority.
- [x] ACL contributes directly through generic protected policy capabilities and has no dependency or peer relationship with access-plugin.
- [x] Roles and authentication-facing integrations provide neutral request subjects and grant no policy authority by themselves.
- [x] ACL public, principal, role, master, reference cleanup, PostgreSQL, event, and application-isolation behavior remains unchanged.

## Tests

- [x] Runtime declaration, type, language-service, filter, plan, provider, source, packed, and application-isolation tests preserve exact current contracts.
- [x] Negative tests prove Core alone exposes no Access product vocabulary after the migration boundary is active.
- [x] Existing Access and enforcement suites migrate or adapt through public plugin APIs and retain focused coverage.
- [x] PostgreSQL E2E covers reads, counts, relations, itemized mutations, field transitions, master, persistence rewrites, and application isolation.
- [x] ACL, Roles, PostgreSQL constraint, event, cleanup, packed, and provider-order suites pass without an access-plugin dependency.

## Implementation evidence

- `@ultimabase/access-plugin` owns the official authoring contracts, Typegen
  option descriptors, contribution targets, plan compiler, Runtime engine, and
  diagnostics in one package using public Core and plugin-kit imports only.
- Core's `protectedPolicy()` extends the existing Runtime constraint capability
  with deny-only operation, relation, prepared-target, mutation-outcome, row,
  field, and structural-result effects whose accumulated state remains private.
- ACL contributes its protected field, row, input, target, cleanup, and event
  behavior directly through generic Core capabilities. Its manifest has no
  Access dependency or peer and PostgreSQL continues to consume only its opaque
  adapter constraints.
- Focused source and language-service tests prove official provider ordering,
  extension and field-kind targets, Core-only option absence, generated option
  presence, diagnostics, ACL-only execution, and composition with an
  independent policy engine.
- The complete repository gate passed 1,808 unit/type tests and 158 built E2E
  tests, including all PostgreSQL suites, package archives, ACL, Roles, Master,
  relationship recursion, mutation transitions, and application isolation.

## Out of scope

- New Access policy semantics or provider types.
- Final Core removal audit; issue 1508 owns it.
