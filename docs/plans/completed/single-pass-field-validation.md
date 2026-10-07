# Single-pass field validation

- Status: completed
- Milestone: 21

## Objective

Milestone 21 made each field's Standard Schema validator one mutation-input
policy boundary. Core validates complete canonical values once after every
optional input transform. Reads and result boundaries retain repeatable
structural snapshots without replaying application policy.

## Completed order

1. Issue 2101 decided the single-pass boundary and arithmetic semantics.
2. Issue 2102 implemented final-only application validation and exact atomic
   projection from prepared locked targets.
3. Issue 2103 audited every responsibility and verified the complete public,
   packed, JavaScript, Typegen, and PostgreSQL vertical.

## Outcome

Direct create, update, and upsert values, Core defaults and generators, and
values returned by Hooks input resolution cross one mandatory Standard Schema
pass. Master cannot bypass it. Existing persisted values do not cross it during
reads, adapter snapshots, materialization, inclusion, or final projection.

For `increment` and `decrement`, Core validates the complete projected value
from the prepared locked target while preserving the original atomic adapter
operation. Targetless upsert and bulk arithmetic over validated fields fail
before persistence when exact targets are unavailable. Structural snapshots
continue rejecting malformed stored values independently of application rules.

## Verification

- The responsibility audit found one application-validation execution mode and
  one owning final mutation stage for direct and projected complete values.
- The focused PostgreSQL test proved Hooks normalization, defaults, pointers,
  includes, Master behavior, atomic rejection before persistence, readable
  legacy values, and structural rejection of malformed storage.
- `corepack yarn constraints`
- `corepack yarn check:issues` — 1 file and 9 tests passed
- `corepack yarn typecheck`
- `corepack yarn test` — 343 files and 1,723 tests passed
- `corepack yarn lint` — zero errors; reviewed line-budget warnings only
- `corepack yarn format:check`
- `corepack yarn build` — every package passed declarations, ATTW, and publint
- `corepack yarn test:pack` — 19 files and 93 tests passed
- `corepack yarn test:e2e:built` — 51 files and 196 tests passed, including
  PostgreSQL Testcontainers
- `corepack yarn workspace @ultimabase/example-todo-backend typecheck`

No milestone work was deferred. ACL hardening issues 432 through 435 remain in
their independent paused plan.
