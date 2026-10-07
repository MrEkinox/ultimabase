# Standard Schema field validation

- Status: completed
- Milestone: 20

## Objective

Milestone 20 replaced the closed built-in field-validation DSL with one
validator-neutral Standard Schema boundary. Presence and storage shape remain
inspectable direct field options, while Standard Schema owns additional
application validation without transforming canonical values.

## Completed order

1. Issue 2001 — decided the Standard Schema validation boundary.
2. Issue 2002 — moved required presence to a direct field option.
3. Issue 2003 — moved inspectable decimal shape metadata to direct options.
4. Issue 2004 — replaced the field-constraint DSL with Standard Schema.
5. Issue 2005 — proved validator interoperability and generated DX.
6. Issue 2008 — placed application validation after input resolution.
7. Issue 2007 — removed planned validation-only field extensions.
8. Issue 2006 — verified the complete validation vertical.

## Outcome

Core owns canonical snapshots, presence, nullability, defaults, generators,
structured shape, relationships, and final validation placement. A developer's
synchronous Standard Schema validator sees the complete canonical non-null
value after explicit input resolution and can reject it without replacing it.
Typegen omits the opaque validator, PostgreSQL reads decimal storage shape only
from direct options, and native fields compose with validation-only formats
without another UltimaBase plugin.

## Verification

- `yarn constraints`
- `yarn check:issues` — 1 file and 9 tests passed
- `yarn typecheck`
- `yarn test` — 340 files and 1,711 tests passed
- `yarn lint` — zero errors; reviewed line-budget warnings only
- `yarn format:check`
- `yarn build` — all packages passed ATTW and publint
- `yarn test:pack` — 19 files and 93 tests passed
- `yarn test:e2e:built` — 50 files and 195 tests passed, including PostgreSQL
  Testcontainers
- Todo backend workspace typecheck

Production source, built declarations, package archives, active documentation,
and package manifests exposed no superseded validation DSL or concrete
validator dependency. No milestone work was deferred. ACL hardening issues 432
through 435 remain in their independent paused plan.
