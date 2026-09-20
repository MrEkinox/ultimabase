# 3015: Simplify the Access plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/access-plugin`
- Depends on: 3014
- ADR: retained Access and public-kernel decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify Access compilation and enforcement on the smaller kernel without
changing its public policy language or monotonic security behavior.

## Acceptance criteria

- [ ] Map the package to the contract matrix and measure files, lines, exports,
      compilation stages, normalized forms, callbacks, diagnostics, and tests.
- [ ] Remove duplicate normalization, command mapping, registration, projection,
      and lifecycle work made obsolete by the canonical graph.
- [ ] Preserve default denial, exact operation and schema-mutation rules, row
      filters, item checks, field restrictions, relation-write enforcement,
      compatible providers, callback attribution, diagnostics, and uniform
      Master bypass.
- [ ] Keep Access independent from ACL, Roles, authentication, Soft Delete, and
      product-specific permission names.
- [ ] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [ ] Review the Access pages identified by documentation ownership. Apply any
      approved public change to `apps/website/content/docs` and the package
      README in this issue; otherwise record why those pages remain accurate.

## Tests

- [ ] Source and packed types, JavaScript, conformance, policy monotonicity,
      relations, nested writes, schema mutations, diagnostics, Master, and
      PostgreSQL suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit the complete package diff for policy broadening, duplicate paths,
      leaked product vocabulary, lost editor behavior, and speculative helpers.
      Correct findings and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding a permission feature or changing an application's policies.
